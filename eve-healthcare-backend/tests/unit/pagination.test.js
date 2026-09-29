const { getPagination, buildPaginatedResponse } = require('../../src/utils/pagination');

describe('pagination utils', () => {
  test('defaults to page 1 and limit 10 when not provided', () => {
    expect(getPagination({})).toEqual({ page: 1, limit: 10, offset: 0 });
  });

  test('parses valid page and limit from query', () => {
    expect(getPagination({ page: '3', limit: '5' })).toEqual({ page: 3, limit: 5, offset: 10 });
  });

  test('falls back to defaults for invalid/garbage values', () => {
    expect(getPagination({ page: '-1', limit: 'abc' })).toEqual({ page: 1, limit: 10, offset: 0 });
  });

  test('caps limit at maxLimit', () => {
    expect(getPagination({ limit: '1000' }, { maxLimit: 100 }).limit).toBe(100);
  });

  test('buildPaginatedResponse computes totalPages and next/prev flags', () => {
    const response = buildPaginatedResponse({ rows: [1, 2], total: 25, page: 2, limit: 10 });
    expect(response.pagination).toEqual({
      page: 2,
      limit: 10,
      total: 25,
      totalPages: 3,
      hasNextPage: true,
      hasPrevPage: true,
    });
  });

  test('buildPaginatedResponse reports no next page on the last page', () => {
    const response = buildPaginatedResponse({ rows: [1], total: 21, page: 3, limit: 10 });
    expect(response.pagination.hasNextPage).toBe(false);
    expect(response.pagination.hasPrevPage).toBe(true);
  });
});
