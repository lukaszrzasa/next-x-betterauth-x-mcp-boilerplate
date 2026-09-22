import "server-only";

/** Atomic verification: typos preserve the challenge, success spends it once.
 * The failure budget is checked and updated in the same command so concurrent
 * guesses cannot bypass it. Resending never modifies this budget.
 */
export const VERIFY_EMAIL_CHALLENGE = `
local failures = tonumber(redis.call('GET', KEYS[2]) or '0')
if failures >= tonumber(ARGV[2]) then return -1 end
local expected = redis.call('GET', KEYS[1])
if expected and expected == ARGV[1] then
  redis.call('DEL', KEYS[1], KEYS[2])
  return 1
end
local count = redis.call('INCR', KEYS[2])
if count == 1 then redis.call('EXPIRE', KEYS[2], ARGV[3]) end
if count >= tonumber(ARGV[2]) then return -1 end
return 0
`;
