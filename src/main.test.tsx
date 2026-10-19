import { render, screen } from '@testing-library/react';

it('Vitest con jsdom y testing-library funciona', () => {
  render(<h1>Stock del hogar</h1>);
  expect(screen.getByRole('heading', { name: 'Stock del hogar' })).toBeInTheDocument();
});
