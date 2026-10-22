/** Values are normalized by parseSalesChannel: one legacy value or a JSON string array, never JSON nulls. */
export const SALES_CHANNEL_PREDICATE = `((@channel = '' OR IFNULL(sm_channel, '(none)') = @channel) AND NOT STARTS_WITH(@channel, '[')
  OR IFNULL(sm_channel, '(none)') IN UNNEST(IFNULL(JSON_VALUE_ARRAY(@channel), ARRAY<STRING>[])))`;
