// Import the AWS SDK v3 Cognito Identity Provider Client
const { 
    CognitoIdentityProviderClient, 
    AdminDisableUserCommand, 
    AdminDeleteUserCommand 
} = require("@aws-sdk/client-cognito-identity-provider");

// Initialize the Cognito Client
// The region should ideally be passed as an environment variable
const cognitoClient = new CognitoIdentityProviderClient({ 
    region: process.env.COGNITO_REGION || "ap-south-1" 
});

const userPoolId = process.env.USER_POOL_ID;

/**
 * Processes a single user record removed from DynamoDB via TTL.
 * @param {object} oldImage - The data of the record that was removed.
 */
const processExpiredUser = async (oldImage) => {
    // The 'userId' from DynamoDB is the 'Username' (sub) in Cognito
    const username = oldImage.userId?.S;

    if (!username) {
        console.warn("Skipping record because it's missing a userId:", oldImage);
        return;
    }

    console.log(`Processing expired user with Username: ${username}`);

    try {
        // Step 1: Disable the user in Cognito
        console.log(`Disabling user: ${username}`);
        const disableUserCommand = new AdminDisableUserCommand({
            UserPoolId: userPoolId,
            Username: username,
        });
        await cognitoClient.send(disableUserCommand);
        console.log(`Successfully disabled user: ${username}`);

        // Step 2: Delete the user from Cognito
        console.log(`Deleting user: ${username}`);
        const deleteUserCommand = new AdminDeleteUserCommand({
            UserPoolId: userPoolId,
            Username: username,
        });
        await cognitoClient.send(deleteUserCommand);
        console.log(`Successfully deleted user: ${username}`);

    } catch (error) {
        console.error(`Failed to disable or delete user ${username}:`, error);
        // In a production scenario, you might send this to a Dead Letter Queue (DLQ)
    }
};

/**
 * Main Lambda handler triggered by a DynamoDB Stream event.
 * @param {object} event - The event object from the DynamoDB Stream.
 */
module.exports.DeleteUser = async (event) => {
    console.log('Received DynamoDB Stream event:', JSON.stringify(event, null, 2));

    for (const record of event.Records) {
        // We only care about records that were REMOVED from the stream
        if (record.eventName !== 'REMOVE') {
            continue;
        }
        
        // // The userIdentity check ensures the removal was caused by the DynamoDB TTL service
        // if (record.userIdentity?.type !== 'Service' || record.userIdentity?.principalId !== 'dynamodb.amazonaws.com') {
        //     console.log("Skipping record not removed by DynamoDB TTL service.");
        //     continue;
        // }

        const oldImage = record.dynamodb?.OldImage;

        if (!oldImage) {
            console.warn('Skipping record with no OldImage:', record);
            continue;
        }

        await processExpiredUser(oldImage);
    }
};