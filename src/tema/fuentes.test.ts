import tokens from './tokens.json';
import { FAMILIAS } from './fuentes';

describe('FAMILIAS', () => {
  test('hay una familia por cada peso de tokens.json', () => {
    expect(Object.keys(FAMILIAS).sort()).toEqual(Object.keys(tokens.peso).sort());
  });
});
