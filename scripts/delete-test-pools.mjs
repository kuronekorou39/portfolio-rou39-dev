import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { CognitoIdentityProviderClient, ListUserPoolsCommand, DeleteUserPoolCommand } = require(
  '../node_modules/@aws-sdk/client-cognito-identity-provider'
);

const client = new CognitoIdentityProviderClient({ region: 'ap-northeast-1' });
const PROTECTED_POOL_ID = 'ap-northeast-1_FJeIsc61q'; // portfolio-users - DO NOT DELETE

async function listAllPools() {
  const pools = [];
  let nextToken;
  do {
    const cmd = new ListUserPoolsCommand({ MaxResults: 60, NextToken: nextToken });
    const res = await client.send(cmd);
    pools.push(...(res.UserPools || []));
    nextToken = res.NextToken;
  } while (nextToken);
  return pools;
}

async function main() {
  console.log('Fetching all user pools...');
  const allPools = await listAllPools();
  console.log(`Total pools found: ${allPools.length}`);

  const testPools = allPools.filter(p => p.Name.startsWith('test'));
  console.log(`test_for* pools to delete: ${testPools.length}`);

  // Safety check
  const protectedPool = testPools.find(p => p.Id === PROTECTED_POOL_ID);
  if (protectedPool) {
    console.error('ERROR: portfolio-users pool matched filter! Aborting.');
    process.exit(1);
  }

  let deleted = 0;
  let failed = 0;
  for (const pool of testPools) {
    try {
      await client.send(new DeleteUserPoolCommand({ UserPoolId: pool.Id }));
      deleted++;
      if (deleted % 50 === 0) console.log(`  Deleted ${deleted}/${testPools.length}...`);
    } catch (err) {
      console.error(`  Failed to delete ${pool.Name} (${pool.Id}): ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone! Deleted: ${deleted}, Failed: ${failed}`);
}

main().catch(console.error);
