import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  CognitoIdentityProviderClient,
  ListUserPoolsCommand,
  UpdateUserPoolCommand,
  DeleteUserPoolCommand,
  DescribeUserPoolCommand,
} = require('../node_modules/@aws-sdk/client-cognito-identity-provider');

const client = new CognitoIdentityProviderClient({ region: 'ap-northeast-1' });
const PROTECTED_POOL_ID = 'ap-northeast-1_FJeIsc61q';

const poolIds = [
  'ap-northeast-1_J2pjl57gs',
  'ap-northeast-1_PmayULAPY',
  'ap-northeast-1_SC5ta0naE',
  'ap-northeast-1_bvlyzLPtX',
  'ap-northeast-1_cdoEKaULw',
  'ap-northeast-1_jtOc83TAd',
  'ap-northeast-1_yec6ImG1C',
  'ap-northeast-1_zQLHkQOLT',
];

async function main() {
  for (const id of poolIds) {
    if (id === PROTECTED_POOL_ID) {
      console.log(`SKIP: ${id} is portfolio-users`);
      continue;
    }
    try {
      // Disable deletion protection (need to include AutoVerifiedAttributes)
      await client.send(new UpdateUserPoolCommand({
        UserPoolId: id,
        DeletionProtection: 'INACTIVE',
        AutoVerifiedAttributes: ['email'],
      }));
      // Delete
      await client.send(new DeleteUserPoolCommand({ UserPoolId: id }));
      console.log(`Deleted: ${id}`);
    } catch (err) {
      console.error(`Failed ${id}: ${err.message}`);
    }
  }
  console.log('Done!');
}

main().catch(console.error);
