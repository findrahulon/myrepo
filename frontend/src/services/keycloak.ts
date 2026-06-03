import Keycloak from 'keycloak-js';

const keycloak = new Keycloak({
  url: 'http://localhost:8080',
  realm: 'ragnarok',
  clientId: 'ragnarok-app',
});

export default keycloak;
