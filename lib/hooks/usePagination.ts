import React, { useState, useMemo, Dispatch, SetStateAction } from 'react';

export interface UsePaginationReturn<T> {
  currentPage: number;
  totalPages: number;
  paginatedItems: T[];
  nextPage: () => void;
  prevPage: () => void;
  setPage: (page: number) => void;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
}

export function usePagination<T>(items: T[], pageSize: number): UsePaginationReturn<T> {
  const [currentPage, setCurrentPage] = useState<number>(1);

  const totalPages = Math.ceil(items.length / pageSize);

  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, currentPage, pageSize]);

  const nextPage = () => setCurrentPage((p) => Math.min(p + 1, totalPages));
  const prevPage = () => setCurrentPage((p) => Math.max(p - 1, 1));
  const setPage = (page: number) => setCurrentPage(Math.max(1, Math.min(page, totalPages)));

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