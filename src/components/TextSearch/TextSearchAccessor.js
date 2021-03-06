import * as R from 'ramda';
import { StatefulAccessor, ValueState } from 'searchkit';

// import sid from 'shortid';

import { TextSearchQueryBuilder, formatText } from './TextSearchQueryBuilder';

// Because bools are stringified
const clearExtract = entry => ({ ...entry, exact: entry.exact === 'true' });
const getTextLength = R.pathOr(0, ['text', 'length']);
/*
	NOTE:
	If we have an id system for tracking flags
	The ids inside flag make it easier to search, however, they will spam query string
	They should be removed when stringifying, and unstringifying
*/
export class TextSearchAccessor extends StatefulAccessor {
	constructor(key, fields, flags) {
		super(key);
		this.state = new ValueState();
		this.fields = fields;
		this.flags = flags;
	}

	getState() {
		return this.state.getValue() || {};
	}

	getFlags() {
		return R.propOr([], 'flags', this.getState());
	}

	removeFlag(text, type) {
		this.updateState({
			flags: R.filter(entry => !(entry.text === text && entry.flag === type), this.getFlags()),
		});
	}

	setSearch(search) {
		this.updateState({ search });
	}

	updateState(newState) {
		this.state = R.pipe(
			R.mergeDeepRight(this.getState()),
			this.state.create.bind(this.state)
		)(newState);
	}

	addFlag(newFlag) {
		this.updateState({ flags: R.append(newFlag, this.getFlags()) });
	}

	addFilters = (search, flags, initialQuery) => {
		let query = initialQuery;
		const hasFlags = flags && flags.length !== 0;
		if (hasFlags) {
			query = flags.reduce((q, entry, index) => {
				return q.addSelectedFilter({
					name: index === 0 ? 'Text query' : this.flags[entry.flag].text,
					value: (entry.exact ? 'Exact phrase: ' : '') + formatText(entry.exact, entry.text),
					id: this.key,
					remove: () => this.removeFlag(entry.text, entry.flag),
				});
			}, query);
		}
		if (search && search.text.length !== 0) {
			query = query.addSelectedFilter({
				name: hasFlags ? this.flags[search.flag].text : 'Text query',
				value: formatText(search.exact, search.text),
				id: this.key,
				remove: () => this.setSearch(undefined),
			});
		}
		return query;
	};

	fromQueryObject(ob) {
		const value = ob[this.urlKey];
		if (!value) {
			return;
		}
		const search = value.search ? clearExtract(value.search) : undefined;
		const flags = value.flags ? value.flags.map(clearExtract) : undefined;
		this.state = this.state.setValue({ search, flags });
	}

	getQueryObject() {
		let val = this.state.getValue();
		return val
			? {
					[this.urlKey]: val,
			  }
			: {};
	}

	buildSharedQuery(initialQuery) {
		const { search, flags } = this.getState();
		const flagLength = R.pathOr(0, ['length'], flags);
		const textLength = getTextLength(search);
		if (flagLength === 0 && textLength === 0) {
			return initialQuery;
		}
		const stateQuery = TextSearchQueryBuilder(search, flags, this.fields);
		const query = initialQuery.addQuery(stateQuery);
		return this.addFilters(search, flags, query);
	}
}
