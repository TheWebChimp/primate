/**
 * QueryBuilder - Handles query construction for Primate service
 *
 * Extracted from PrimateService to improve modularity and testability.
 * Provides methods for building search queries, field filters, where clauses,
 * and include objects for Prisma queries.
 */

/**
 * Input validation constants to prevent abuse and DoS attacks
 */
const VALIDATION_LIMITS = {
	MAX_SEARCH_TERM_LENGTH: 500,
	MAX_FILTER_VALUE_LENGTH: 1000,
	MAX_ARRAY_VALUES: 100,
	MAX_PAGE_LIMIT: 1000,
	MIN_PAGE: 1,
	MAX_FIELD_NAME_LENGTH: 64,
	ALLOWED_FIELD_NAME_PATTERN: /^[a-zA-Z_][a-zA-Z0-9_.]*$/,
};

class QueryBuilder {
	/**
	 * Create a new QueryBuilder
	 * @param {Object} orm - ORM object containing model field definitions
	 */
	constructor(orm) {
		this.orm = orm;
	}

	/**
	 * Get ORM object for a model
	 * @param {string} model - Model name
	 * @returns {Object|null} Model fields object or null if not found
	 */
	getORMObject(model) {
		if(!model || typeof model !== 'string') return null;
		const normalizedModel = model.toLowerCase();
		return this.orm[normalizedModel] || this.orm[model] || null;
	}

	/**
	 * Validate and sanitize a field name
	 * @param {string} field - Field name to validate
	 * @returns {boolean} True if valid field name
	 */
	isValidFieldName(field) {
		if(typeof field !== 'string') return false;
		if(field.length > VALIDATION_LIMITS.MAX_FIELD_NAME_LENGTH) return false;
		return VALIDATION_LIMITS.ALLOWED_FIELD_NAME_PATTERN.test(field);
	}

	/**
	 * Validate search term
	 * @param {string} searchTerm - Search term to validate
	 * @returns {string} Sanitized search term
	 */
	validateSearchTerm(searchTerm) {
		if(typeof searchTerm !== 'string') return '';
		return searchTerm.slice(0, VALIDATION_LIMITS.MAX_SEARCH_TERM_LENGTH).trim();
	}

	/**
	 * Validate filter value
	 * @param {string} value - Filter value to validate
	 * @returns {string} Sanitized filter value
	 */
	validateFilterValue(value) {
		if(typeof value !== 'string') return value;
		return value.slice(0, VALIDATION_LIMITS.MAX_FILTER_VALUE_LENGTH);
	}

	/**
	 * Build search query for full-text search
	 * @param {string} model - Model name
	 * @param {string} searchTerm - Term to search for
	 * @param {string[]} queryableFields - Fields to search in
	 * @returns {Object[]} Array of OR conditions for Prisma where clause
	 */
	buildSearchQuery(model, searchTerm, queryableFields) {
		const modelFields = this.getORMObject(model);
		if(!modelFields) return [];

		const orConditions = [];

		// Validate and sanitize search term
		const sanitizedTerm = this.validateSearchTerm(searchTerm);
		if(!sanitizedTerm) return orConditions;

		// Add ID search if term is numeric and within safe integer range
		const numericId = parseInt(sanitizedTerm, 10);
		if(!isNaN(numericId) && Number.isSafeInteger(numericId) && numericId > 0) {
			orConditions.push({ id: numericId });
		}

		// Build field-specific search conditions
		queryableFields.forEach(field => {
			// Validate field name
			if(!this.isValidFieldName(field)) return;

			if(field.includes('.')) {
				// Handle relation fields
				const [relation, subfield] = field.split('.');
				if(this.isValidFieldName(relation) && this.isValidFieldName(subfield) && modelFields.hasOwnProperty(relation)) {
					orConditions.push({
						[relation]: { [subfield]: { contains: sanitizedTerm } },
					});
				}
			} else if(modelFields.hasOwnProperty(field)) {
				// Handle direct fields
				if(modelFields[field] === 'String') {
					orConditions.push({
						[field]: { contains: sanitizedTerm },
					});
				} else if(modelFields[field] === 'Int') {
					const numValue = parseInt(sanitizedTerm, 10);
					if(!isNaN(numValue) && Number.isSafeInteger(numValue)) {
						orConditions.push({ [field]: numValue });
					}
				}
			}
		});

		return orConditions;
	}

	/**
	 * Build field-specific filters from query parameters
	 * @param {string} model - Model name
	 * @param {Object} query - Query parameters
	 * @param {Object} existingWhere - Existing where conditions to merge
	 * @returns {Object} Prisma where clause
	 */
	buildFieldFilters(model, query, existingWhere = {}) {
		const modelFields = this.orm[model];
		if(!modelFields) return existingWhere;

		const where = { ...existingWhere };

		Object.entries(modelFields).forEach(([field, fieldType]) => {
			// Validate field name
			if(!this.isValidFieldName(field)) return;

			if(query[field] !== undefined && field !== 'relations') {
				let value = query[field];

				if(typeof value === 'string') {
					// Validate and sanitize the value
					value = this.validateFilterValue(value);

					// Handle comma-separated values (IN operator)
					if(value.includes(',')) {
						const values = value.split(',').map(v => v.trim());
						// Limit array size to prevent DoS
						where[field] = { in: values.slice(0, VALIDATION_LIMITS.MAX_ARRAY_VALUES) };
					}
					// Handle pipe-separated values (array contains)
					else if(value.includes('|')) {
						const values = value.split('|').map(v => v.trim());
						where[field] = { has: values.slice(0, VALIDATION_LIMITS.MAX_ARRAY_VALUES) };
					}
					// Handle range queries for numbers and dates
					else if(value.includes('..')) {
						const [min, max] = value.split('..');
						if(fieldType === 'Int' || fieldType === 'Float') {
							const minNum = parseFloat(min);
							const maxNum = parseFloat(max);
							const rangeQuery = {};
							if(!isNaN(minNum) && isFinite(minNum)) rangeQuery.gte = minNum;
							if(!isNaN(maxNum) && isFinite(maxNum)) rangeQuery.lte = maxNum;
							if(Object.keys(rangeQuery).length > 0) {
								where[field] = rangeQuery;
							}
						} else if(fieldType === 'DateTime') {
							const minDate = new Date(min);
							const maxDate = new Date(max);
							const rangeQuery = {};
							if(!isNaN(minDate.getTime())) rangeQuery.gte = minDate;
							if(!isNaN(maxDate.getTime())) rangeQuery.lte = maxDate;
							if(Object.keys(rangeQuery).length > 0) {
								where[field] = rangeQuery;
							}
						}
					}
					// Simple equality
					else {
						if(fieldType === 'Int') {
							const numValue = parseInt(value, 10);
							if(!isNaN(numValue) && Number.isSafeInteger(numValue)) {
								where[field] = numValue;
							}
						} else {
							where[field] = value;
						}
					}
				} else {
					where[field] = value;
				}
			}
		});

		return where;
	}

	/**
	 * Build where clause with support for different ID types
	 * @param {string} model - Model name
	 * @param {string|number} id - Record ID
	 * @param {Object} options - Query options
	 * @returns {Object} Prisma where clause
	 */
	buildWhereClause(model, id, options = {}) {
		if(options.resolveWhere) {
			return options.resolveWhere(model, id);
		}

		const modelFields = this.orm[model];

		// Handle search by alternative field
		if(options.searchField && isNaN(parseInt(id, 10))) {
			const searchFields = Array.isArray(options.searchField)
				? options.searchField
				: [options.searchField];

			// Search for matching field in order of priority
			for(const field of searchFields) {
				if(modelFields && modelFields.hasOwnProperty(field)) {
					return { [field]: id };
				}
			}
		}

		// Handle UID-based lookup
		if(modelFields && modelFields.hasOwnProperty('uid') && isNaN(parseInt(id, 10))) {
			return { uid: id };
		}

		// Default to ID-based lookup
		return { id: parseInt(id, 10) };
	}

	/**
	 * Build include object from query parameters
	 * @param {Object} query - Query parameters (looking for 'fetch-*' params)
	 * @param {Object} options - Options containing default includes
	 * @returns {Object} Prisma include object
	 */
	buildIncludeObject(query, options = {}) {
		const include = options.include ? { ...options.include } : {};

		// Process fetch-* query parameters
		Object.entries(query).forEach(([key, value]) => {
			if(key.startsWith('fetch-')) {
				const relation = key.replace('fetch-', '');
				if(this.isValidFieldName(relation) && value === '1' || value === 'true' || value === true) {
					include[relation] = true;
				}
			}
		});

		return Object.keys(include).length > 0 ? include : undefined;
	}

	/**
	 * Validate pagination parameters
	 * @param {Object} params - Pagination parameters
	 * @returns {Object} Validated pagination object
	 */
	validatePagination(params = {}) {
		let page = parseInt(params.page, 10) || 1;
		let limit = parseInt(params.limit, 10) || 100;

		// Enforce limits
		page = Math.max(VALIDATION_LIMITS.MIN_PAGE, page);
		limit = Math.min(VALIDATION_LIMITS.MAX_PAGE_LIMIT, Math.max(1, limit));

		return {
			page,
			limit,
			skip: (page - 1) * limit,
		};
	}
}

export default QueryBuilder;
export { QueryBuilder, VALIDATION_LIMITS };
