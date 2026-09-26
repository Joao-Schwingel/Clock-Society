import nextConfig from "eslint-config-next/core-web-vitals";

const config = [
  ...nextConfig,
  {
    ignores: ["e2e/mock-server/fixtures/**", "playwright-report/**", "test-results/**"],
  },
  {
    // Fase 1 (rede de testes): nenhuma mudança de comportamento é permitida no código de
    // produção além das extrações mecânicas da spec §5. As regras abaixo (novas no
    // eslint-plugin-react-hooks bundlado pelo eslint-config-next atual) apontam padrões
    // pré-existentes em todo o código de dados (setState em useEffect, closures de
    // vendedores/configurações, Math.random em render). Ficam como "warn" — visíveis, sem
    // travar o CI — até serem endereçadas fora desta fase.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/purity": "warn",
      "react/no-unescaped-entities": "warn",
    },
  },
];

export default config;
