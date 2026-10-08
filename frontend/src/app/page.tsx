export default function HomePage() {
  return (
    <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8">
      {/* Header */}
      <header className="border-b border-slate-200 pb-6 mb-8">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold tracking-wider uppercase text-blue-800 bg-blue-100 px-2.5 py-1 rounded">
              UNSA - Ingenieria de Sistemas
            </span>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 mt-2">
              CampusUNSA
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Hub Academico y Asistente Conversacional Multi-Campus
            </p>
          </div>
          <div className="text-right">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
              Ambiente Local Activo
            </span>
            <p className="text-xs text-slate-500 mt-1">Sprint 1 - v1.0.0-dev</p>
          </div>
        </div>
      </header>

      {/* Grid of Campus Areas */}
      <section className="mb-10">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4">
          Sedes Universitarias Conectadas
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border border-slate-200 rounded-lg p-4 bg-white shadow-sm">
            <h3 className="font-semibold text-slate-900">Campus Ingenierias</h3>
            <p className="text-xs text-slate-500 mt-1">Av. Paucarpata / Independencia</p>
            <span className="inline-block mt-3 text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
              Sistemas, Civil, Minas, Industrial
            </span>
          </div>
          <div className="border border-slate-200 rounded-lg p-4 bg-white shadow-sm">
            <h3 className="font-semibold text-slate-900">Campus Biomedicas</h3>
            <p className="text-xs text-slate-500 mt-1">Av. Alcides Carrion</p>
            <span className="inline-block mt-3 text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
              Medicina, Enfermeria, Biologia
            </span>
          </div>
          <div className="border border-slate-200 rounded-lg p-4 bg-white shadow-sm">
            <h3 className="font-semibold text-slate-900">Campus Sociales</h3>
            <p className="text-xs text-slate-500 mt-1">Av. Venezuela</p>
            <span className="inline-block mt-3 text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
              Derecho, Economia, Administracion
            </span>
          </div>
        </div>
      </section>

      {/* System Infrastructure Status */}
      <section className="mb-8">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4">
          Estado de Componentes Core (Infraestructura Docker)
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="border border-slate-200 rounded-lg p-3 bg-white text-center">
            <p className="text-xs text-slate-500">FastAPI Core</p>
            <p className="text-sm font-bold text-slate-900 mt-1">Puerto 8000</p>
            <span className="inline-block mt-1 text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
              Online
            </span>
          </div>
          <div className="border border-slate-200 rounded-lg p-3 bg-white text-center">
            <p className="text-xs text-slate-500">PostgreSQL 16</p>
            <p className="text-sm font-bold text-slate-900 mt-1">Puerto 5432</p>
            <span className="inline-block mt-1 text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
              Ready
            </span>
          </div>
          <div className="border border-slate-200 rounded-lg p-3 bg-white text-center">
            <p className="text-xs text-slate-500">Redis 7 Store</p>
            <p className="text-sm font-bold text-slate-900 mt-1">Puerto 6379</p>
            <span className="inline-block mt-1 text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
              Ready
            </span>
          </div>
          <div className="border border-slate-200 rounded-lg p-3 bg-white text-center">
            <p className="text-xs text-slate-500">Evolution API</p>
            <p className="text-sm font-bold text-slate-900 mt-1">Puerto 8080</p>
            <span className="inline-block mt-1 text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
              Standby
            </span>
          </div>
        </div>
      </section>

      {/* Next Steps Card */}
      <section className="border border-blue-200 bg-blue-50 rounded-lg p-5">
        <h3 className="text-sm font-bold text-blue-900">
          Proxima Entrega: Sprint 2 (Identidad & Autenticacion Institucional)
        </h3>
        <p className="text-xs text-blue-700 mt-1 leading-relaxed">
          La base de infraestructura compartida esta configurada. La siguiente iteracion implementara
          el login seguro mediante Google OAuth2 restringido al dominio institucional @unsa.edu.pe y
          el control de acceso basado en roles (RBAC).
        </p>
      </section>
    </main>
  );
}
