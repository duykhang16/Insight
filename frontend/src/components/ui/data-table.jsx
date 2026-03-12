import React, { useState, useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ChevronUp, ChevronDown, ChevronsUpDown, Search, X } from 'lucide-react';

/**
 * A reusable, responsive DataTable built on top of shadcn's Table.
 *
 * ## Props
 * - `columns` — array of column configs: { key, label, render?, sortable?, hidden?, className?, headerClassName?, mobileLabel? }
 * - `data` — array of row objects
 * - `keyExtractor` — fn(row) → unique key
 * - `onRowClick` — optional fn(row)
 * - `emptyMessage` — string shown when no data
 * - `searchable` — boolean, show search bar
 * - `searchKeys` — array of keys to search in (string fields)
 * - `searchPlaceholder` — placeholder string
 * - `actions` — fn(row) → React node for row actions column
 * - `rowClassName` — fn(row) → extra className for row
 * - `loading` — boolean
 * - `stickyHeader` — boolean
 * - `pagination` — { page, pageSize, total, onPageChange } or null
 * - `headerExtra` — React node to render between search and table
 * - `cardMode` — 'auto' | 'always' | 'never' (default: 'auto' means card mode on mobile)
 */
export function DataTable({
  columns,
  data = [],
  keyExtractor,
  onRowClick,
  emptyMessage = 'No data found.',
  searchable = false,
  searchKeys = [],
  searchPlaceholder = 'Search...',
  actions,
  rowClassName,
  loading = false,
  stickyHeader = false,
  pagination,
  headerExtra,
  cardMode = 'auto',
}) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');

  // ------- Filter -------
  const filtered = useMemo(() => {
    if (!search.trim() || searchKeys.length === 0) return data;
    const q = search.toLowerCase();
    return data.filter(row =>
      searchKeys.some(key => {
        const val = row[key];
        return val && String(val).toLowerCase().includes(q);
      })
    );
  }, [data, search, searchKeys]);

  // ------- Sort -------
  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const visibleColumns = columns.filter(c => !c.hidden);

  const SortIcon = ({ colKey }) => {
    if (sortKey !== colKey) return <ChevronsUpDown className="w-3 h-3 ml-1 opacity-30" />;
    return sortDir === 'asc'
      ? <ChevronUp className="w-3 h-3 ml-1 text-blue-400" />
      : <ChevronDown className="w-3 h-3 ml-1 text-blue-400" />;
  };

  // -------- Card rendering for mobile --------
  const renderCard = (row, idx) => {
    const key = keyExtractor ? keyExtractor(row) : idx;
    return (
      <div
        key={key}
        className={`th-bg-surface border th-border rounded-xl p-4 space-y-3 transition-all hover:shadow-md ${
          onRowClick ? 'cursor-pointer active:scale-[0.99]' : ''
        } ${rowClassName ? rowClassName(row) : ''}`}
        onClick={() => onRowClick?.(row)}
      >
        {visibleColumns.map(col => {
          const val = col.render ? col.render(row) : row[col.key];
          return (
            <div key={col.key} className="flex items-start justify-between gap-2">
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider shrink-0">
                {col.mobileLabel || col.label}
              </span>
              <span className="text-sm th-text-primary text-right">
                {val ?? '—'}
              </span>
            </div>
          );
        })}
        {actions && (
          <div className="flex items-center justify-end gap-1 pt-2 border-t th-border">
            {actions(row)}
          </div>
        )}
      </div>
    );
  };

  // -------- Loading --------
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" />
      </div>
    );
  }

  const isCardMode = cardMode === 'always' || (cardMode === 'auto');
  const showSearch = searchable && searchKeys.length > 0;

  return (
    <div className="space-y-4">
      {/* Search bar */}
      {showSearch && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            className="w-full th-bg-elevated border th-border rounded-lg pl-9 pr-8 py-2 text-sm th-text-primary placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
            placeholder={searchPlaceholder}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:th-text-primary">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {headerExtra}

      {/* Card mode for mobile */}
      {isCardMode && (
        <div className="md:hidden space-y-3">
          {sorted.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">{emptyMessage}</div>
          ) : (
            sorted.map((row, idx) => renderCard(row, idx))
          )}
        </div>
      )}

      {/* Table mode for desktop */}
      <div className={isCardMode ? 'hidden md:block' : ''}>
        <div className="th-bg-surface border th-border rounded-xl overflow-hidden">
          <Table>
            <TableHeader className={stickyHeader ? 'table-header-sticky' : ''}>
              <TableRow className="th-bg-surface-alt hover:bg-transparent">
                {visibleColumns.map(col => (
                  <TableHead
                    key={col.key}
                    className={`text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 ${
                      col.sortable ? 'cursor-pointer select-none hover:text-slate-300 transition-colors' : ''
                    } ${col.headerClassName || ''}`}
                    onClick={col.sortable ? () => handleSort(col.key) : undefined}
                  >
                    <div className="flex items-center">
                      {col.label}
                      {col.sortable && <SortIcon colKey={col.key} />}
                    </div>
                  </TableHead>
                ))}
                {actions && (
                  <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 w-[1%]" />
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={visibleColumns.length + (actions ? 1 : 0)}
                    className="text-center py-12 text-slate-500 text-sm"
                  >
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              ) : (
                sorted.map((row, idx) => {
                  const key = keyExtractor ? keyExtractor(row) : idx;
                  return (
                    <TableRow
                      key={key}
                      className={`transition-colors ${
                        onRowClick ? 'cursor-pointer' : ''
                      } ${rowClassName ? rowClassName(row) : ''}`}
                      onClick={() => onRowClick?.(row)}
                    >
                      {visibleColumns.map(col => (
                        <TableCell
                          key={col.key}
                          className={`px-4 py-3 ${col.className || ''}`}
                        >
                          {col.render ? col.render(row) : (row[col.key] ?? '—')}
                        </TableCell>
                      ))}
                      {actions && (
                        <TableCell className="px-4 py-3">
                          <div className="flex items-center gap-1 justify-end" onClick={e => e.stopPropagation()}>
                            {actions(row)}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pagination */}
      {pagination && (
        <div className="flex items-center gap-3 justify-between pt-2">
          <span className="text-xs text-slate-500">
            {pagination.total != null ? `${sorted.length} of ${pagination.total} results` : `${sorted.length} results`}
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={pagination.page === 0}
              onClick={() => pagination.onPageChange(pagination.page - 1)}
              className="px-3 py-1.5 th-bg-elevated hover:bg-slate-700 disabled:opacity-40 th-text-secondary text-sm rounded-lg transition-colors"
            >
              ← Prev
            </button>
            <span className="text-sm text-slate-500">Page {pagination.page + 1}</span>
            <button
              disabled={sorted.length < pagination.pageSize}
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              className="px-3 py-1.5 th-bg-elevated hover:bg-slate-700 disabled:opacity-40 th-text-secondary text-sm rounded-lg transition-colors"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default DataTable;
