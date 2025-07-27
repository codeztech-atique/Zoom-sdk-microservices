// Import the AWS SDK v3 DynamoDB Document Client using CommonJS syntax
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");

// Initialize the DynamoDB Document Client for the specified region
const client = new DynamoDBClient({ region: "us-east-1" });
const docClient = DynamoDBDocumentClient.from(client);

// The name of your DynamoDB table
const tableName = process.env.DYNAMODB_TABLE_NAME;

/**
 * Processes the user data and adds it to DynamoDB.
 * @param {object} userAttributes - The user attributes from the Cognito event.
 */
const addUserToDynamoDB = async (userAttributes) => {
    // Extract user details from the Cognito event
    const userId = userAttributes.sub; // 'sub' is the unique user ID in Cognito
    const createdAt = new Date().toISOString();

    // Calculate the TTL (Time to Live)
    // The value must be a Unix timestamp in seconds.
    const ttlInSeconds = Math.floor(Date.now() / 1000) + (3 * 60); // Current time + 5 minutes
    

    // Prepare the item to be saved in DynamoDB
    const params = {
        TableName: tableName,
        Item: {
            userId: userId,
            email: userAttributes.email,
            createdAt: createdAt,
            expireAt: ttlInSeconds,
        },
    };

    try {
        console.log(`Processing user with ID = ${userId}`);
        console.log("Attempting to add user to DynamoDB:", JSON.stringify(params.Item, null, 2));
        
        // Create a new PutCommand with the parameters
        const command = new PutCommand(params);
        
        // Execute the command to save the item
        await docClient.send(command);
        
        console.log(`Successfully added user ${userId} to DynamoDB.`);
    } catch (error) {
        console.error(`Failed to process user ${userId}:`, error);
        // It's important not to throw an error back to Cognito,
        // as it might cause issues with the user's sign-up flow.
        // We just log the error for debugging.
    }
};

/**
 * This is the main handler for the Lambda function.
 * It's triggered by a Cognito Post Confirmation event.
 * @param {object} event - The event object from Cognito.
 */
module.exports.UserToDynamodb = async (event) => {
    console.log('Received Cognito event:', JSON.stringify(event, null, 2));

    // Ensure the trigger source is a Post Confirmation
    if (event.triggerSource !== "PostConfirmation_ConfirmSignUp") {
        console.log(`Trigger source is ${event.triggerSource}, not PostConfirmation_ConfirmSignUp. Skipping.`);
        return event;
    }

    const userAttributes = event.request.userAttributes;

    if (!userAttributes || !userAttributes.sub) {
        console.warn('Skipping event with invalid user attributes:', event);
        return event;
    }

    // Call the processor function to handle the logic
    await addUserToDynamoDB(userAttributes);

    // Return the original event to Cognito to complete the flow
    return event;
};
