import type {
  Pattern,
  SelectPattern,
  GuardPattern,
  NotPattern,
  GuardValue,
  GuardFunction,
  OneOfPattern,
  ExhaustivePattern,
} from './types/Pattern';

import type {
  Unset,
  Match,
  PickReturnValue,
  ExhaustiveMatch,
  EmptyMatch,
} from './types/Match';

import { __, PatternType } from './PatternType';
import { DistributeUnions } from './types/DistributeUnions';

export const when = <a, b extends a = a>(
  predicate: GuardFunction<a, b>
): GuardPattern<a, b> => ({
  __patternKind: PatternType.Guard,
  __when: predicate,
});

export const not = <a>(pattern: Pattern<a>): NotPattern<a> => ({
  __patternKind: PatternType.Not,
  __pattern: pattern,
});

export const select = <k extends string>(key: k): SelectPattern<k> => ({
  __patternKind: PatternType.Select,
  __key: key,
});

export const oneOf = <a>(
  ...patterns: ExhaustivePattern<a>[]
): OneOfPattern<a> => ({
  __patternKind: PatternType.OneOf,
  __patterns: patterns,
});

/**
 * # Pattern matching
 **/

export { Pattern, __ };

/**
 * ### match
 * Entry point to create pattern matching code branches. It returns an
 * empty Match case.
 */
export const match = <a, b = Unset>(value: a): EmptyMatch<a, b> =>
  builder<a, b>(value, []);

/**
 * ### builder
 * This is the implementation of our pattern matching, using the
 * builder pattern.
 * This builder pattern is neat because we can have complexe type checking
 * for each of the methods adding new behavior to our pattern matching.
 */
const builder = <a, b>(
  value: a,
  patterns: {
    test: (value: a) => unknown;
    select: (value: a) => object;
    handler: (...args: any) => any;
  }[]
): EmptyMatch<a, b> => ({
  with<p extends Pattern<a>, c>(
    pattern: p,
    ...args: any[]
  ): Match<a, PickReturnValue<b, c>> {
    const handler = args[args.length - 1];
    const predicates = args.slice(0, -1);

    const doesMatch = (value: a) =>
      Boolean(
        matchPattern<a, p>(pattern)(value) &&
          predicates.every((predicate) => predicate(value as any))
      );

    return builder<a, PickReturnValue<b, c>>(value, [
      ...patterns,
      {
        test: doesMatch,
        handler,
        select: selectWithPattern<a, p>(pattern),
      },
    ]);
  },

  when: <p extends (value: a) => unknown, c>(
    predicate: p,
    handler: (value: GuardValue<p>) => PickReturnValue<b, c>
  ): Match<a, PickReturnValue<b, c>> =>
    builder<a, PickReturnValue<b, c>>(value, [
      ...patterns,
      {
        test: predicate,
        handler,
        select: () => ({}),
      },
    ]),

  otherwise: <c>(handler: () => PickReturnValue<b, c>): PickReturnValue<b, c> =>
    builder<a, PickReturnValue<b, c>>(value, [
      ...patterns,
      {
        test: matchPattern<a, Pattern<a>>(__ as Pattern<a>),
        handler,
        select: () => ({}),
      },
    ]).run(),

  run: (): b => {
    const entry = patterns.find(({ test }) => test(value));
    if (!entry) {
      let displayedValue;
      try {
        displayedValue = JSON.stringify(value);
      } catch (e) {
        displayedValue = value;
      }
      throw new Error(
        `Pattern matching error: no pattern matches value ${displayedValue}`
      );
    }
    return entry.handler(value, entry.select(value));
  },

  /**
   * ### exhaustive
   * creates an exhaustive match expression checking
   * that **all cases are handled**. `when` predicates
   * aren't supported on exhaustive matches.
   **/
  exhaustive: (): ExhaustiveMatch<DistributeUnions<a>, a, b> =>
    builder(value, patterns) as any,
});

const isObject = (value: unknown): value is Object =>
  Boolean(value && typeof value === 'object');

const isArray = (value: unknown): value is any[] => Array.isArray(value);

const isGuardPattern = (x: unknown): x is GuardPattern<unknown> => {
  const pattern = x as GuardPattern<unknown>;
  return (
    pattern &&
    pattern.__patternKind === PatternType.Guard &&
    typeof pattern.__when === 'function'
  );
};

const isNotPattern = (x: unknown): x is NotPattern<unknown> => {
  const pattern = x as NotPattern<unknown>;
  return pattern && pattern.__patternKind === PatternType.Not;
};

const isSelectPattern = (x: unknown): x is SelectPattern<string> => {
  const pattern = x as SelectPattern<string>;
  return pattern && pattern.__patternKind === PatternType.Select;
};

const isListPattern = (x: unknown): x is [Pattern<unknown>] => {
  return Array.isArray(x) && x.length === 1;
};

// tells us if the value matches a given pattern.
const matchPattern = <a, p extends Pattern<a>>(pattern: p) => (
  value: a
): boolean => {
  if (pattern === __ || isSelectPattern(pattern)) return true;

  if (pattern === __.string) return typeof value === 'string';
  if (pattern === __.boolean) return typeof value === 'boolean';
  if (pattern === __.number) {
    return typeof value === 'number' && !Number.isNaN(value);
  }
  if (isGuardPattern(pattern)) return Boolean(pattern.__when(value));
  if (isNotPattern(pattern)) return !matchPattern(pattern.__pattern)(value);
  if (isListPattern(pattern) && isArray(value))
    return value.every((v) => matchPattern(pattern[0])(v));

  if (typeof pattern !== typeof value) return false;

  if (isArray(pattern) && isArray(value)) {
    return pattern.length === value.length
      ? pattern.every((subPattern, i) => matchPattern(subPattern)(value[i]))
      : false;
  }

  if (value instanceof Map && pattern instanceof Map) {
    return [...pattern.keys()].every((key) =>
      matchPattern(pattern.get(key))(value.get(key))
    );
  }

  if (value instanceof Set && pattern instanceof Set) {
    const patternValues = [...pattern.values()];
    const allValues = [...value.values()];
    return patternValues.length === 0
      ? allValues.length === 0
      : patternValues.length === 1
      ? patternValues.every((subPattern) =>
          Object.values(__).includes(subPattern)
            ? matchPattern<any, Pattern<any>>([subPattern])(allValues)
            : value.has(subPattern)
        )
      : patternValues.every((subPattern) => value.has(subPattern));
  }

  if (isObject(value) && isObject(pattern)) {
    return Object.keys(pattern).every((k: string): boolean =>
      // @ts-ignore
      matchPattern(pattern[k])(value[k])
    );
  }
  return value === pattern;
};

const selectWithPattern = <a, p extends Pattern<a>>(pattern: p) => (
  value: a
): Record<string, unknown> => {
  if (isSelectPattern(pattern)) return { [pattern.__key]: value };

  if (isListPattern(pattern) && isArray(value))
    return value
      .map((v) => selectWithPattern(pattern[0])(v))
      .reduce<Record<string, unknown[]>>((acc, selections) => {
        return Object.keys(selections).reduce((acc, key) => {
          acc[key] = (acc[key] || []).concat([selections[key]]);
          return acc;
        }, acc);
      }, {});

  if (isArray(pattern) && isArray(value))
    return pattern.length <= value.length
      ? pattern.reduce(
          (acc, subPattern, i) =>
            Object.assign(acc, selectWithPattern(subPattern)(value[i])),
          {}
        )
      : {};

  if (isObject(pattern) && isObject(value))
    return Object.keys(pattern).reduce(
      (acc, k: string) =>
        // @ts-ignore
        Object.assign(acc, selectWithPattern(pattern[k])(value[k])),
      {}
    );

  return {};
};
