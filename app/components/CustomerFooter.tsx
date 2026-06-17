export function CustomerFooter() {
  return (
    <footer className="px-4 py-6 border-t-4 border-blue-900 mt-4">
      <div className="max-w-2xl mx-auto">
        <div className="p-3 bg-sky-50 border border-sky-200 rounded-xl">
          <p className="text-sm font-bold text-blue-900 mb-1">DISCLAIMER:</p>
          <p className="text-xs text-blue-800 leading-relaxed">
            This product was not produced in a commercial kitchen. It has been home-processed in a
            kitchen that may also process common food allergens such as tree nuts, peanuts, eggs,
            soy, wheat, milk, fish, and crustacean shellfish.
          </p>
        </div>
      </div>
    </footer>
  );
}
