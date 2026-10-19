// En el build solo-memoria el acceso sale del integrante `yo` de la casa de ejemplo (Ana, la admin),
// con la capa de datos de verdad.

import { render, screen, waitFor } from '@testing-library/react';

import { SesionProvider, useSesion } from './sesion';

function Sonda() {
  const s = useSesion();
  return <span data-testid="acceso">{`${s.yo?.nombre ?? ''} ${JSON.stringify(s.acceso)}`}</span>;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

test('en modo memoria el acceso es el de Ana: admin, sin permisos registrados', async () => {
  vi.stubEnv('VITE_DATOS', 'memoria');
  render(
    <SesionProvider>
      <Sonda />
    </SesionProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('acceso').textContent).toBe('Ana {"admin":true,"permisos":[]}'));
});
