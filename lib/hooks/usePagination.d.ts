export function usePagination(items: any[], pageSize: number): {
  currentPage: number;
  totalPages: number;
  paginatedItems: any[];
  nextPage: () => void;
  prevPage: () => void;
  setPage: (page: number) => void;
  setCurrentPage: (page: number) => void;
};
