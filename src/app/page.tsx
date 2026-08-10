const foundations = [
  "Astronomical facts come from a validated provider boundary.",
  "Numerology calculations remain deterministic and traceable.",
  "Interpretation and optional AI prose cannot alter source facts.",
] as const;

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-6 py-16 sm:px-10">
      <p className="text-sm font-semibold tracking-[0.2em] text-sky-300 uppercase">
        Architecture baseline
      </p>
      <h1 className="mt-4 max-w-4xl text-4xl leading-tight font-semibold text-white sm:text-6xl">
        Personal cosmic context, built on reproducible calculations.
      </h1>
      <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
        The application shell is operational. Calculation engines, provider
        adapters, and product experiences will be added in dependency order.
      </p>

      <section aria-labelledby="foundation-heading" className="mt-12">
        <h2
          id="foundation-heading"
          className="text-xl font-semibold text-white"
        >
          Foundation rules
        </h2>
        <ul className="mt-5 grid gap-4 md:grid-cols-3">
          {foundations.map((foundation) => (
            <li
              key={foundation}
              className="rounded-2xl border border-white/10 bg-white/5 p-5 leading-7 text-slate-200"
            >
              {foundation}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
