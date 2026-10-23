import nextConfig from "eslint-config-next/core-web-vitals";

const config = [
  ...nextConfig,
  {
    ignores: ["e2e/fixtures/**", "playwright-report/**", "test-results/**"],
  },
  {
    // e2e/** é infra de teste Node/Playwright, não código React — o parâmetro
    // "use" do fixture do Playwright (`async ({page}, use) => ...`) é lido
    // pelo eslint-plugin-react-hooks como o hook use() do React fora de um
    // componente, gerando falso positivo.
    files: ["e2e/**/*.ts"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
    },
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
