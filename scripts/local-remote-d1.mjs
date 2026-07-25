export const LOCAL_REMOTE_D1_MODE = "remote-staging";
export const LOCAL_REMOTE_D1_DATABASE_NAME = "jae-noi-pork-shop-staging";
export const LOCAL_REMOTE_D1_DATABASE_ID = "0b46c51f-c8b4-40b5-9ff5-efa681d7c1ee";

export function isRemoteStagingD1Enabled(environment = process.env) {
  return environment.LOCAL_D1_MODE === LOCAL_REMOTE_D1_MODE;
}
