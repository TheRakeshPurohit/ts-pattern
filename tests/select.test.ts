import { Expect, Equal } from '../src/types/helpers';
import { match, __, select, not } from '../src';
import { State, Event } from './utils';
import {
  MixedNamedAndAnonymousSelectError,
  SeveralAnonymousSelectError,
} from '../src/types/FindSelected';

describe('select', () => {
  it('should work with tuples', () => {
    expect(
      match<[string, number], number>(['get', 2])
        .with(['get', select('y')], ({ y }) => {
          type t = Expect<Equal<typeof y, number>>;
          return y;
        })
        .run()
    ).toEqual(2);
  });

  it('should work with array', () => {
    expect(
      match<string[], string[]>(['you', 'hello'])
        .with([__.listOf, select('texts')], ({ texts }, xs) => {
          type t = Expect<Equal<typeof xs, string[]>>;
          type t2 = Expect<Equal<typeof texts, string[]>>;
          return texts;
        })
        .run()
    ).toEqual(['you', 'hello']);

    expect(
      match<{ text: string }[], string[]>([{ text: 'you' }, { text: 'hello' }])
        .with([__.listOf, { text: select('texts') }], ({ texts }, xs) => {
          type t = Expect<Equal<typeof xs, { text: string }[]>>;
          type t2 = Expect<Equal<typeof texts, string[]>>;
          return texts;
        })
        .run()
    ).toEqual(['you', 'hello']);

    expect(
      match<{ text: { content: string } }[], string[]>([
        { text: { content: 'you' } },
        { text: { content: 'hello' } },
      ])
        .with(
          [__.listOf, { text: { content: select('texts') } }],
          ({ texts }, xs) => {
            type t = Expect<Equal<typeof texts, string[]>>;
            return texts;
          }
        )
        .run()
    ).toEqual(['you', 'hello']);
  });

  it('should work with objects', () => {
    expect(
      match<State & { other: number }, string>({
        status: 'success',
        data: 'some data',
        other: 20,
      })
        .with(
          {
            status: 'success',
            data: select('data'),
            other: select('other'),
          },
          ({ data, other }) => {
            type t = Expect<Equal<typeof data, string>>;
            type t2 = Expect<Equal<typeof other, number>>;
            return data + other.toString();
          }
        )
        .run()
    ).toEqual('some data20');
  });

  it('should work with primitive types', () => {
    expect(
      match<string, string>('hello')
        .with(select('x'), ({ x }) => {
          type t = Expect<Equal<typeof x, string>>;
          return x;
        })
        .run()
    ).toEqual('hello');
  });

  it('should work with complex structures', () => {
    const initState: State = {
      status: 'idle',
    };

    const reducer = (state: State, event: Event): State =>
      match<[State, Event], State>([state, event])
        .with(
          [
            { status: 'loading' },
            {
              type: 'success',
              data: select('data'),
              requestTime: select('time'),
            },
          ],
          ({ data, time }) => {
            type t = Expect<Equal<typeof time, number | undefined>>;

            return {
              status: 'success',
              data,
            };
          }
        )
        .with(
          [{ status: 'loading' }, { type: 'success', data: select('data') }],
          ({ data }) => ({
            status: 'success',
            data,
          })
        )
        .with(
          [{ status: 'loading' }, { type: 'error', error: select('error') }],
          ({ error }) => ({
            status: 'error',
            error,
          })
        )
        .with([{ status: 'loading' }, { type: 'cancel' }], () => initState)
        .with([{ status: not('loading') }, { type: 'fetch' }], () => ({
          status: 'loading',
        }))
        .with([select('state'), select('event')], ({ state, event }) => {
          type t = Expect<Equal<typeof state, State>>;
          type t2 = Expect<Equal<typeof event, Event>>;
          return state;
        })
        .run();

    expect(reducer(initState, { type: 'cancel' })).toEqual(initState);

    expect(reducer(initState, { type: 'fetch' })).toEqual({
      status: 'loading',
    });

    expect(
      reducer({ status: 'loading' }, { type: 'success', data: 'yo' })
    ).toEqual({
      status: 'success',
      data: 'yo',
    });

    expect(reducer({ status: 'loading' }, { type: 'cancel' })).toEqual({
      status: 'idle',
    });
  });

  it('should support nesting of several arrays', () => {
    type Input = [{ name: string }, { post: { title: string }[] }][];
    expect(
      match<Input>([
        [
          { name: 'Gabriel' },
          { post: [{ title: 'Hello World' }, { title: "what's up" }] },
        ],
        [{ name: 'Alice' }, { post: [{ title: 'Hola' }, { title: 'coucou' }] }],
      ])
        .with([], (x) => {
          type t = Expect<Equal<typeof x, []>>;
          return 'empty';
        })
        .with(
          [
            __.listOf,
            [
              { name: select('names') },
              { post: [__.listOf, { title: select('titles') }] },
            ],
          ],
          ({ names, titles }) => {
            type t = Expect<Equal<typeof names, string[]>>;
            type t2 = Expect<Equal<typeof titles, string[][]>>;
            return (
              names.join(' and ') +
              ' have written ' +
              titles.map((t) => t.map((t) => `"${t}"`).join(', ')).join(', ')
            );
          }
        )
        .exhaustive()
    ).toEqual(
      `Gabriel and Alice have written "Hello World", "what's up", "Hola", "coucou"`
    );
  });

  it('Anonymous selections should support nesting of several arrays', () => {
    type Input = [{ name: string }, { post: { title: string }[] }][];
    expect(
      match<Input>([
        [
          { name: 'Gabriel' },
          { post: [{ title: 'Hello World' }, { title: "what's up" }] },
        ],
        [{ name: 'Alice' }, { post: [{ title: 'Hola' }, { title: 'coucou' }] }],
      ])
        .with([], (x) => {
          type t = Expect<Equal<typeof x, []>>;
          return 'empty';
        })
        .with(
          [__.listOf, [__, { post: [__.listOf, { title: select() }] }]],
          (titles) => {
            type t1 = Expect<Equal<typeof titles, string[][]>>;
            return titles
              .map((t) => t.map((t) => `"${t}"`).join(', '))
              .join(', ');
          }
        )
        .exhaustive()
    ).toEqual(`"Hello World", "what's up", "Hola", "coucou"`);
  });

  it('should infer the selection to an error when using several anonymous selection', () => {
    match({ type: 'point', x: 2, y: 3 })
      .with({ type: 'point', x: select(), y: select() }, (x) => {
        type t = Expect<Equal<typeof x, SeveralAnonymousSelectError>>;
        return 'ok';
      })
      .run();
  });

  it('should infer the selection to an error when using mixed named and unnamed selections', () => {
    match({ type: 'point', x: 2, y: 3 })
      .with({ type: 'point', x: select(), y: select('y') }, (x) => {
        type t = Expect<Equal<typeof x, MixedNamedAndAnonymousSelectError>>;
        return 'ok';
      })
      .run();
  });
});
