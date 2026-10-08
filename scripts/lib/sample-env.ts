/** Blank values also override Next's dotenv loading. Tests never inherit a live warehouse. */
export const sampleEnvironment = Object.fromEntries(
  [
    "SM_APPLICATION_ID",
    "SM_APP_KEY",
    "BIGQUERY_JOB_PROJECT_ID",
    "BIGQUERY_LOCATION",
    "SM_DATA_PROJECT_ID",
    "SM_TRANSFORMED_DATASET_ID",
    "SM_METADATA_DATASET_ID",
    "APP_BASIC_AUTH",
    "APP_STORE_ID",
    "CF_ACCESS_TEAM_DOMAIN",
    "CF_ACCESS_AUD",
    "BIGQUERY_MAX_BYTES_BILLED",
  ].map((name) => [name, ""]),
);
