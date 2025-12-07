/**
 * Unit tests for QueryBuilder class
 */
import { QueryBuilder, VALIDATION_LIMITS } from '../../src/lib/query-builder.js';

describe('QueryBuilder', () => {
	let queryBuilder;
	const mockOrm = {
		user: {
			id: 'Int',
			name: 'String',
			email: 'String',
			age: 'Int',
			createdAt: 'DateTime',
			status: 'String',
			relations: {},
		},
		post: {
			id: 'Int',
			title: 'String',
			content: 'String',
			authorId: 'Int',
		},
	};

	beforeEach(() => {
		queryBuilder = new QueryBuilder(mockOrm);
	});

	describe('isValidFieldName', () => {
		it('should return true for valid field names', () => {
			expect(queryBuilder.isValidFieldName('name')).toBe(true);
			expect(queryBuilder.isValidFieldName('user_name')).toBe(true);
			expect(queryBuilder.isValidFieldName('userName')).toBe(true);
			expect(queryBuilder.isValidFieldName('_private')).toBe(true);
			expect(queryBuilder.isValidFieldName('field123')).toBe(true);
		});

		it('should return false for invalid field names', () => {
			expect(queryBuilder.isValidFieldName('')).toBe(false);
			expect(queryBuilder.isValidFieldName('123field')).toBe(false);
			expect(queryBuilder.isValidFieldName('field-name')).toBe(false);
			expect(queryBuilder.isValidFieldName('field name')).toBe(false);
			expect(queryBuilder.isValidFieldName(null)).toBe(false);
			expect(queryBuilder.isValidFieldName(undefined)).toBe(false);
			expect(queryBuilder.isValidFieldName(123)).toBe(false);
		});

		it('should return false for field names exceeding max length', () => {
			const longName = 'a'.repeat(VALIDATION_LIMITS.MAX_FIELD_NAME_LENGTH + 1);
			expect(queryBuilder.isValidFieldName(longName)).toBe(false);
		});
	});

	describe('validateSearchTerm', () => {
		it('should return empty string for non-string input', () => {
			expect(queryBuilder.validateSearchTerm(null)).toBe('');
			expect(queryBuilder.validateSearchTerm(undefined)).toBe('');
			expect(queryBuilder.validateSearchTerm(123)).toBe('');
			expect(queryBuilder.validateSearchTerm({})).toBe('');
		});

		it('should trim whitespace', () => {
			expect(queryBuilder.validateSearchTerm('  hello  ')).toBe('hello');
		});

		it('should truncate long search terms', () => {
			const longTerm = 'a'.repeat(VALIDATION_LIMITS.MAX_SEARCH_TERM_LENGTH + 100);
			const result = queryBuilder.validateSearchTerm(longTerm);
			expect(result.length).toBe(VALIDATION_LIMITS.MAX_SEARCH_TERM_LENGTH);
		});
	});

	describe('validateFilterValue', () => {
		it('should return non-string values as-is', () => {
			expect(queryBuilder.validateFilterValue(123)).toBe(123);
			expect(queryBuilder.validateFilterValue(true)).toBe(true);
		});

		it('should truncate long string values', () => {
			const longValue = 'a'.repeat(VALIDATION_LIMITS.MAX_FILTER_VALUE_LENGTH + 100);
			const result = queryBuilder.validateFilterValue(longValue);
			expect(result.length).toBe(VALIDATION_LIMITS.MAX_FILTER_VALUE_LENGTH);
		});
	});

	describe('buildSearchQuery', () => {
		it('should return empty array for empty search term', () => {
			const result = queryBuilder.buildSearchQuery('user', '', ['name', 'email']);
			expect(result).toEqual([]);
		});

		it('should include ID search for numeric terms', () => {
			const result = queryBuilder.buildSearchQuery('user', '123', ['name']);
			expect(result).toContainEqual({ id: 123 });
		});

		it('should not include ID for non-numeric terms', () => {
			const result = queryBuilder.buildSearchQuery('user', 'john', ['name']);
			expect(result).not.toContainEqual(expect.objectContaining({ id: expect.anything() }));
		});

		it('should build contains queries for String fields', () => {
			const result = queryBuilder.buildSearchQuery('user', 'john', ['name', 'email']);
			expect(result).toContainEqual({ name: { contains: 'john' } });
			expect(result).toContainEqual({ email: { contains: 'john' } });
		});

		it('should handle relation fields', () => {
			const ormWithRelations = {
				post: {
					id: 'Int',
					author: {},
				},
			};
			const qb = new QueryBuilder(ormWithRelations);
			const result = qb.buildSearchQuery('post', 'john', ['author.name']);
			expect(result).toContainEqual({ author: { name: { contains: 'john' } } });
		});

		it('should skip invalid field names', () => {
			const result = queryBuilder.buildSearchQuery('user', 'test', ['name', '123invalid']);
			expect(result.length).toBe(1);
		});
	});

	describe('buildFieldFilters', () => {
		it('should build simple equality filters', () => {
			const result = queryBuilder.buildFieldFilters('user', { status: 'active' });
			expect(result).toEqual({ status: 'active' });
		});

		it('should handle comma-separated values as IN operator', () => {
			const result = queryBuilder.buildFieldFilters('user', { status: 'active,pending,suspended' });
			expect(result.status).toEqual({ in: ['active', 'pending', 'suspended'] });
		});

		it('should limit array size for comma-separated values', () => {
			const manyValues = Array(150).fill('val').join(',');
			const result = queryBuilder.buildFieldFilters('user', { status: manyValues });
			expect(result.status.in.length).toBe(VALIDATION_LIMITS.MAX_ARRAY_VALUES);
		});

		it('should handle range queries for Int fields', () => {
			const result = queryBuilder.buildFieldFilters('user', { age: '18..65' });
			expect(result.age).toEqual({ gte: 18, lte: 65 });
		});

		it('should handle range queries for DateTime fields', () => {
			const result = queryBuilder.buildFieldFilters('user', { createdAt: '2024-01-01..2024-12-31' });
			expect(result.createdAt.gte).toBeInstanceOf(Date);
			expect(result.createdAt.lte).toBeInstanceOf(Date);
		});

		it('should handle partial range queries', () => {
			const result = queryBuilder.buildFieldFilters('user', { age: '18..' });
			expect(result.age).toEqual({ gte: 18 });
		});

		it('should parse Int values for Int fields', () => {
			const result = queryBuilder.buildFieldFilters('user', { age: '25' });
			expect(result.age).toBe(25);
		});

		it('should merge with existing where conditions', () => {
			const result = queryBuilder.buildFieldFilters('user', { status: 'active' }, { id: 1 });
			expect(result).toEqual({ id: 1, status: 'active' });
		});
	});

	describe('buildWhereClause', () => {
		it('should return ID-based where for numeric IDs', () => {
			const result = queryBuilder.buildWhereClause('user', 123);
			expect(result).toEqual({ id: 123 });
		});

		it('should use UID for non-numeric IDs when model has uid field', () => {
			const ormWithUid = { user: { id: 'Int', uid: 'String' } };
			const qb = new QueryBuilder(ormWithUid);
			const result = qb.buildWhereClause('user', 'abc-123');
			expect(result).toEqual({ uid: 'abc-123' });
		});

		it('should use custom resolveWhere if provided', () => {
			const customResolver = (model, id) => ({ customField: id });
			const result = queryBuilder.buildWhereClause('user', 123, { resolveWhere: customResolver });
			expect(result).toEqual({ customField: 123 });
		});

		it('should handle searchField option', () => {
			const result = queryBuilder.buildWhereClause('user', 'john@example.com', { searchField: 'email' });
			expect(result).toEqual({ email: 'john@example.com' });
		});
	});

	describe('buildIncludeObject', () => {
		it('should build include from fetch-* query params', () => {
			const result = queryBuilder.buildIncludeObject({ 'fetch-posts': '1', 'fetch-comments': 'true' });
			expect(result).toEqual({ posts: true, comments: true });
		});

		it('should return undefined when no includes', () => {
			const result = queryBuilder.buildIncludeObject({});
			expect(result).toBeUndefined();
		});

		it('should merge with default includes', () => {
			const result = queryBuilder.buildIncludeObject({ 'fetch-posts': '1' }, { include: { profile: true } });
			expect(result).toEqual({ profile: true, posts: true });
		});
	});

	describe('validatePagination', () => {
		it('should return default values for empty params', () => {
			const result = queryBuilder.validatePagination({});
			expect(result.page).toBe(1);
			expect(result.limit).toBe(100);
			expect(result.skip).toBe(0);
		});

		it('should parse string values', () => {
			const result = queryBuilder.validatePagination({ page: '2', limit: '20' });
			expect(result.page).toBe(2);
			expect(result.limit).toBe(20);
			expect(result.skip).toBe(20);
		});

		it('should enforce minimum page', () => {
			const result = queryBuilder.validatePagination({ page: -5 });
			expect(result.page).toBe(1);
		});

		it('should enforce maximum limit', () => {
			const result = queryBuilder.validatePagination({ limit: 5000 });
			expect(result.limit).toBe(VALIDATION_LIMITS.MAX_PAGE_LIMIT);
		});
	});
});
