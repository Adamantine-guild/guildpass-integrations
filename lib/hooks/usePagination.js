import { useState, useMemo } from 'react';

export function usePagination(items, pageSize) {
  const [currentPage, setCurrentPage] = useState(1);

  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, currentPage, pageSize]);

  const totalPages = Math.ceil(items.length / pageSize);

  const nextPage = () => setCurrentPage((p) => Math.min(p + 1, totalPages));
  const prevPage = () => setCurrentPage((p) => Math.max(p - 1, 1));
  const setPage = (page) => setCurrentPage(Math.max(1, Math.min(page, totalPages)));

  return {
    currentPage,
    totalPages,
    paginatedItems,
    nextPage,
    prevPage,
    setPage,
    setCurrentPage,
  };
}
