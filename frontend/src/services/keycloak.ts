import Keycloak from 'keycloak-js';

const host = window.location.hostname;
const keycloakBase = `http://${host}:8080`;

const keycloak = new Keycloak({
  url: keycloakBase,
  realm: 'ragnarok',
  clientId: 'ragnarok-app',
});

export default keycloak;