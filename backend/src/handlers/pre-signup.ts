import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  AdminLinkProviderForUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import type { PreSignUpTriggerEvent } from 'aws-lambda';

const client = new CognitoIdentityProviderClient({});

export async function handler(event: PreSignUpTriggerEvent): Promise<PreSignUpTriggerEvent> {
  const { userPoolId, triggerSource, request, userName } = event;
  const email = request.userAttributes.email;

  if (!email) return event;

  // Only handle external provider sign-ups (Google etc.)
  if (triggerSource === 'PreSignUp_ExternalProvider') {
    // Check if a native (email/password) user with this email already exists
    const existing = await client.send(
      new ListUsersCommand({
        UserPoolId: userPoolId,
        Filter: `email = "${email}"`,
        Limit: 10,
      }),
    );

    const nativeUser = existing.Users?.find(
      (u) => u.UserStatus !== 'EXTERNAL_PROVIDER' && u.Username !== userName,
    );

    if (nativeUser && nativeUser.Username) {
      // Link the external provider to the existing native user
      // userName for external provider is like "Google_1234567890"
      const [providerName, providerUserId] = userName.split('_');
      await client.send(
        new AdminLinkProviderForUserCommand({
          UserPoolId: userPoolId,
          DestinationUser: {
            ProviderName: 'Cognito',
            ProviderAttributeValue: nativeUser.Username,
          },
          SourceUser: {
            ProviderName: providerName,
            ProviderAttributeName: 'Cognito_Subject',
            ProviderAttributeValue: providerUserId,
          },
        }),
      );
    }

    // Auto-confirm and auto-verify email for external providers
    event.response.autoConfirmUser = true;
    event.response.autoVerifyEmail = true;
  }

  // For native sign-ups: check if an external provider user with this email exists
  if (triggerSource === 'PreSignUp_SignUp') {
    const existing = await client.send(
      new ListUsersCommand({
        UserPoolId: userPoolId,
        Filter: `email = "${email}"`,
        Limit: 10,
      }),
    );

    const externalUser = existing.Users?.find(
      (u) => u.Username?.startsWith('Google_') || u.Username?.startsWith('google_'),
    );

    if (externalUser) {
      // An external provider user exists with this email
      // Allow the sign-up to proceed - Cognito will create a native user
      // The user can then link them manually or we auto-link on next Google sign-in
      event.response.autoConfirmUser = false;
      event.response.autoVerifyEmail = false;
    }
  }

  return event;
}
