// Shared by both queries: user-facing relations the connector role can read at least one column of.
const READABLE_RELATION = `
	c.relkind in ('r', 'p', 'v', 'm', 'f')
	and not c.relispartition
	and n.nspname not in ('pg_catalog', 'information_schema')
	and n.nspname not like 'pg\\_toast%'
	and n.nspname not like 'pg\\_temp%'
	and (
		has_table_privilege(c.oid, 'SELECT')
		or exists (
			select 1 from pg_attribute a
			where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
				and has_column_privilege(c.oid, a.attnum, 'SELECT')
		)
	)`;

const KIND = `
	case c.relkind
		when 'r' then 'table'
		when 'p' then 'partitioned table'
		when 'v' then 'view'
		when 'm' then 'materialized view'
		when 'f' then 'foreign table'
	end`;

export const LIST_TABLES_SQL = `
select
	n.nspname as schema,
	c.relname as name,
	${KIND} as kind,
	case when c.reltuples < 0 then null else c.reltuples::float8 end as "estimatedRows",
	obj_description(c.oid, 'pg_class') as comment
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where ${READABLE_RELATION}
	and ($1::text is null or n.nspname = $1::text)
order by n.nspname, c.relname`;

export const DESCRIBE_TABLE_SQL = `
select
	n.nspname as schema,
	c.relname as name,
	${KIND} as kind,
	obj_description(c.oid, 'pg_class') as comment,
	(
		select coalesce(json_agg(json_build_object(
			'name', a.attname,
			'type', format_type(a.atttypid, a.atttypmod),
			'nullable', not a.attnotnull,
			'comment', col_description(c.oid, a.attnum)
		) order by a.attnum), '[]')
		from pg_attribute a
		where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
			and has_column_privilege(c.oid, a.attnum, 'SELECT')
	) as columns,
	(
		select coalesce(json_agg(a.attname order by k.ord), '[]')
		from pg_constraint con
		cross join unnest(con.conkey) with ordinality as k(attnum, ord)
		join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum
		where con.conrelid = c.oid and con.contype = 'p'
	) as "primaryKey",
	(
		select coalesce(json_agg(json_build_object(
			'columns', fk.columns,
			'references', json_build_object('schema', fk.ref_schema, 'table', fk.ref_table, 'columns', fk.ref_columns)
		) order by fk.conname), '[]')
		from (
			select
				con.conname,
				rn.nspname as ref_schema,
				rc.relname as ref_table,
				(
					select json_agg(la.attname order by k.ord)
					from unnest(con.conkey, con.confkey) with ordinality as k(attnum, fattnum, ord)
					join pg_attribute la on la.attrelid = con.conrelid and la.attnum = k.attnum
				) as columns,
				(
					select json_agg(ra.attname order by k.ord)
					from unnest(con.conkey, con.confkey) with ordinality as k(attnum, fattnum, ord)
					join pg_attribute ra on ra.attrelid = con.confrelid and ra.attnum = k.fattnum
				) as ref_columns
			from pg_constraint con
			join pg_class rc on rc.oid = con.confrelid
			join pg_namespace rn on rn.oid = rc.relnamespace
			where con.conrelid = c.oid and con.contype = 'f'
		) fk
	) as "foreignKeys"
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.oid = to_regclass($1::text) and ${READABLE_RELATION}`;
