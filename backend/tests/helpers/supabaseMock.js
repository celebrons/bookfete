// Mock du client Supabase : reproduit l'API fluide (from().select().eq()...) en
// servant des donnees en memoire. Chaque appel est enregistre pour inspection.
//
// Usage :
//   const { createSupabaseMock } = require('./helpers/supabaseMock');
//   const supabase = createSupabaseMock({ books: [fixtureBook], chapters: [...] });

const TERMINAL_KEYS = ['single', 'maybeSingle', 'then'];

function matchesFilters(row, filters) {
  return filters.every((filter) => {
    const value = row?.[filter.column];
    switch (filter.type) {
      case 'eq':
        return String(value) === String(filter.value);
      case 'neq':
        return String(value) !== String(filter.value);
      case 'in':
        return Array.isArray(filter.value) && filter.value.map(String).includes(String(value));
      case 'is':
        return filter.value === null ? value === null || value === undefined : value === filter.value;
      case 'not':
        return String(value) !== String(filter.value);
      case 'gte':
        return value >= filter.value;
      case 'lte':
        return value <= filter.value;
      case 'like':
      case 'ilike': {
        const pattern = String(filter.value).replace(/%/g, '.*');
        return new RegExp(`^${pattern}$`, 'i').test(String(value ?? ''));
      }
      case 'or': {
        // Support minimal : "col.eq.val,col2.eq.val2"
        return String(filter.value)
          .split(',')
          .some((clause) => {
            const [column, op, expected] = clause.split('.');
            if (op !== 'eq') return false;
            return String(row?.[column]) === String(expected);
          });
      }
      default:
        return true;
    }
  });
}

function createSupabaseMock(tables = {}, options = {}) {
  const store = new Map(Object.entries(tables).map(([name, rows]) => [name, [...rows]]));
  const calls = [];
  const { onInsert, onUpdate, onDelete, errors = {} } = options;

  const getRows = (table) => {
    if (!store.has(table)) store.set(table, []);
    return store.get(table);
  };

  function createQuery(table) {
    const state = {
      table,
      operation: 'select',
      filters: [],
      payload: null,
      order: null,
      limitValue: null,
      returnsRows: false
    };

    const resolve = () => {
      calls.push({ ...state, filters: [...state.filters] });

      if (errors[table]) {
        return { data: null, error: errors[table] };
      }

      const rows = getRows(table);

      if (state.operation === 'insert') {
        const inserted = (Array.isArray(state.payload) ? state.payload : [state.payload]).map(
          (row, index) => ({
            id: row.id || `${table}-generated-${rows.length + index + 1}`,
            created_at: row.created_at || '2026-01-01T00:00:00.000Z',
            ...row
          })
        );
        rows.push(...inserted);
        if (onInsert) onInsert(table, inserted);
        return { data: inserted, error: null };
      }

      if (state.operation === 'upsert') {
        // Honore onConflict : met a jour la ligne existante correspondant a
        // la cle composite plutot que d'en creer une doublon (contrairement
        // a un simple insert) — reproduit le vrai comportement Supabase.
        const conflictColumns = String(state.onConflict || '')
          .split(',')
          .map((column) => column.trim())
          .filter(Boolean);
        const incoming = Array.isArray(state.payload) ? state.payload : [state.payload];
        const upserted = [];

        incoming.forEach((row) => {
          const matchIndex = conflictColumns.length > 0
            ? rows.findIndex((existing) => conflictColumns.every((column) => String(existing[column]) === String(row[column])))
            : -1;

          if (matchIndex >= 0) {
            rows[matchIndex] = { ...rows[matchIndex], ...row };
            upserted.push(rows[matchIndex]);
          } else {
            const inserted = {
              id: row.id || `${table}-generated-${rows.length + 1}`,
              created_at: row.created_at || '2026-01-01T00:00:00.000Z',
              ...row
            };
            rows.push(inserted);
            upserted.push(inserted);
          }
        });

        if (onInsert) onInsert(table, upserted);
        return { data: upserted, error: null };
      }

      if (state.operation === 'update') {
        const updated = [];
        rows.forEach((row, index) => {
          if (matchesFilters(row, state.filters)) {
            rows[index] = { ...row, ...state.payload };
            updated.push(rows[index]);
          }
        });
        if (onUpdate) onUpdate(table, updated, state.payload);
        return { data: updated, error: null };
      }

      if (state.operation === 'delete') {
        const kept = [];
        const removed = [];
        rows.forEach((row) => (matchesFilters(row, state.filters) ? removed : kept).push(row));
        store.set(table, kept);
        if (onDelete) onDelete(table, removed);
        return { data: removed, error: null };
      }

      // select
      let result = rows.filter((row) => matchesFilters(row, state.filters));
      if (state.order) {
        const { column, ascending } = state.order;
        result = [...result].sort((a, b) => {
          const left = a?.[column];
          const right = b?.[column];
          if (left === right) return 0;
          const comparison = left > right ? 1 : -1;
          return ascending ? comparison : -comparison;
        });
      }
      if (typeof state.limitValue === 'number') {
        result = result.slice(0, state.limitValue);
      }
      return { data: result, error: null };
    };

    const query = {
      // Filtres
      eq(column, value) {
        state.filters.push({ type: 'eq', column, value });
        return query;
      },
      neq(column, value) {
        state.filters.push({ type: 'neq', column, value });
        return query;
      },
      in(column, value) {
        state.filters.push({ type: 'in', column, value });
        return query;
      },
      is(column, value) {
        state.filters.push({ type: 'is', column, value });
        return query;
      },
      not(column, _operator, value) {
        state.filters.push({ type: 'not', column, value });
        return query;
      },
      gte(column, value) {
        state.filters.push({ type: 'gte', column, value });
        return query;
      },
      lte(column, value) {
        state.filters.push({ type: 'lte', column, value });
        return query;
      },
      like(column, value) {
        state.filters.push({ type: 'like', column, value });
        return query;
      },
      ilike(column, value) {
        state.filters.push({ type: 'ilike', column, value });
        return query;
      },
      or(expression) {
        state.filters.push({ type: 'or', column: '*', value: expression });
        return query;
      },
      // Modificateurs
      select(columns = '*') {
        state.columns = columns;
        state.returnsRows = true;
        return query;
      },
      order(column, { ascending = true } = {}) {
        state.order = { column, ascending };
        return query;
      },
      limit(count) {
        state.limitValue = count;
        return query;
      },
      range(from, to) {
        state.limitValue = to - from + 1;
        return query;
      },
      // Operations
      insert(payload) {
        state.operation = 'insert';
        state.payload = payload;
        return query;
      },
      upsert(payload, options = {}) {
        state.operation = 'upsert';
        state.payload = payload;
        state.onConflict = options.onConflict;
        return query;
      },
      update(payload) {
        state.operation = 'update';
        state.payload = payload;
        return query;
      },
      delete() {
        state.operation = 'delete';
        return query;
      },
      // Terminaisons
      single() {
        const { data, error } = resolve();
        if (error) return Promise.resolve({ data: null, error });
        const rows = Array.isArray(data) ? data : [data];
        if (rows.length === 0) {
          return Promise.resolve({
            data: null,
            error: { code: 'PGRST116', message: 'Aucune ligne trouvee', details: null }
          });
        }
        return Promise.resolve({ data: rows[0], error: null });
      },
      maybeSingle() {
        const { data, error } = resolve();
        if (error) return Promise.resolve({ data: null, error });
        const rows = Array.isArray(data) ? data : [data];
        return Promise.resolve({ data: rows[0] || null, error: null });
      },
      then(onFulfilled, onRejected) {
        return Promise.resolve(resolve()).then(onFulfilled, onRejected);
      }
    };

    return query;
  }

  const client = {
    from(table) {
      return createQuery(table);
    },
    auth: {
      getUser: jest.fn(async (token) => {
        if (!token || token === 'invalid') {
          return { data: { user: null }, error: { message: 'Token invalide' } };
        }
        return {
          data: {
            user: {
              id: options.userId || 'owner-test-1',
              email: options.userEmail || 'organisateur@test.local'
            }
          },
          error: null
        };
      })
    },
    storage: {
      from: () => ({
        upload: jest.fn(async () => ({ data: { path: 'test/path.png' }, error: null })),
        getPublicUrl: () => ({ data: { publicUrl: 'http://supabase.test/public/test.png' } }),
        remove: jest.fn(async () => ({ data: [], error: null }))
      })
    },
    // Utilitaires de test (non presents dans le vrai client)
    __calls: calls,
    __store: store,
    __table: (name) => getRows(name)
  };

  return client;
}

module.exports = { createSupabaseMock, matchesFilters, TERMINAL_KEYS };
