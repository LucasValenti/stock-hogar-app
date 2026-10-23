// En el build solo-memoria el acceso sale del integrante de VITE_YO (Ana si no se dice),
// con la capa de datos de verdad. Se reimporta en cada caso: la capa queda armada al primer uso.

import { render, screen, waitFor } from '@testing-library/react';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function verAcceso(env: Record<string, string>) {
  for (const [clave, valor] of Object.entries(env)) vi.stubEnv(clave, valor);
  vi.resetModules();
  const { SesionProvider, useSesion } = await import('./sesion');
  function Sonda() {
    const s = useSesion();
    return <span data-testid="acceso">{`${s.yo?.nombre ?? ''} ${JSON.stringify(s.acceso)}`}</span>;
  }
  render(
    <SesionProvider>
      <Sonda />
    </SesionProvider>,
  );
  let texto = '';
  await waitFor(() => {
    texto = screen.getByTestId('acceso').textContent ?? '';
    expect(texto).not.toMatch(/ null$/);
  });
  return texto;
}

test('en modo memoria el acceso es el de Ana: admin, sin permisos registrados', async () => {
  expect(await verAcceso({ VITE_DATOS: 'memoria' })).toBe('Ana {"admin":true,"permisos":[]}');
});

test('al guardar el perfil, la sesión toma el nombre nuevo (saludo de Inicio, «Entraste como»)', async () => {
  vi.stubEnv('VITE_DATOS', 'memoria');
  vi.stubEnv('VITE_YO', 'ejemplo-bruno');
  vi.resetModules();
  const { SesionProvider, useSesion } = await import('./sesion');
  const { datos } = await import('@/datos');
  function Sonda() {
    return <span data-testid="nombre">{useSesion().yo?.nombre ?? ''}</span>;
  }
  render(
    <SesionProvider>
      <Sonda />
    </SesionProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('nombre').textContent).toBe('Bruno'));
  await datos.editarPerfil('Bruno T', null);
  await waitFor(() => expect(screen.getByTestId('nombre').textContent).toBe('Bruno T'));
});

test('VITE_YO entra como ese integrante: Bruno no es admin y no ve sueldos', async () => {
  expect(await verAcceso({ VITE_DATOS: 'memoria', VITE_YO: 'ejemplo-bruno' })).toBe(
    'Bruno {"admin":false,"permisos":[]}',
  );
});
