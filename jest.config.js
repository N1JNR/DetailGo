module.exports = {
  preset: 'react-native',
  setupFiles: ['<rootDir>/jest.setup.js'],
  // gifted-charts-core vem junto com react-native-gifted-charts e é publicado
  // em ESM, mas o nome não casa com o padrão react-native-*.
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-navigation|react-native-.*|@react-native-firebase|@testing-library|gifted-charts-core|decode-uri-component)/)',
  ],
  modulePathIgnorePatterns: ['<rootDir>/.claude/worktrees'],
  // As Cloud Functions têm Jest e node_modules próprios, e rodam no job
  // "Testes das Cloud Functions". Sem ignorá-las aqui, os specs delas rodavam
  // duas vezes — e qualquer um que importasse firebase-admin quebrava, porque
  // essa dependência não existe no node_modules do app.
  testPathIgnorePatterns: [
    '<rootDir>/.claude/worktrees',
    '<rootDir>/firestore-tests',
    '<rootDir>/functions',
  ],
  watchPathIgnorePatterns: ['<rootDir>/.claude/worktrees'],
  // Cobertura do projeto inteiro (exclui specs, tipos e barrels).
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.spec.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.types.ts',
    '!src/**/index.ts',
  ],
  coverageReporters: ['text', 'text-summary', 'html'],
  // Ratchet: o CI falha se a cobertura regredir abaixo do piso atual. Só sobe —
  // ao adicionar testes, suba os números. Garante que nunca perdemos cobertura.
  // Ratchet: o piso só sobe. Deixamos ~1 ponto de folga sobre a cobertura real
  // para o CI não quebrar por variação mínima — mas não mais que isso, senão
  // dá para remover teste sem ninguém notar.
  // Cobertura em 02/09/2026: 77.52 stmts · 69.46 branch · 78.54 func · 78.39 lines
  coverageThreshold: {
    global: {
      statements: 77,
      branches: 69,
      functions: 78,
      lines: 78,
    },
  },
};
