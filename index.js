const core = require('@actions/core');
const aws = require('@aws-sdk/client-cloudfront');
const crypto = require('crypto');
const delay = require('delay');

const envVars = {
    DISTRIBUTION_IDS: "DISTRIBUTION_IDS",
    PATHS: "PATHS",
    AWS_REGIONS: "AWS_REGIONS",
    AWS_ACCESS_KEY_IDS: "AWS_ACCESS_KEY_IDS",
    AWS_SECRET_ACCESS_KEYS: "AWS_SECRET_ACCESS_KEYS",
    DELAY: "DELAY"
};

const rawDistributionIDs = process.env[envVars.DISTRIBUTION_IDS];
const rawPaths = process.env[envVars.PATHS];
const rawAWSRegions = process.env[envVars.AWS_REGIONS];
const rawAWSAccessKeyIDs = process.env[envVars.AWS_ACCESS_KEY_IDS];
const rawAWSSecretAccessKeys = process.env[envVars.AWS_SECRET_ACCESS_KEYS];
const delayDuration = parseInt(process.env[envVars.DELAY] || "1000");

function validateInputs(rawDistributionIDs, rawPaths, rawAWSRegions, rawAWSAccessKeyIDs, rawAWSSecretAccessKeys) {
    if (!rawDistributionIDs) {
        throw new Error(`${envVars.DISTRIBUTION_IDS} is not set in environment. Exiting!!`);
    }
    if (!rawPaths) {
        throw new Error(`${envVars.PATHS} is not set in environment. Exiting!!`);
    }
    if (!rawAWSRegions) {
        throw new Error(`${envVars.AWS_REGIONS} is not set in environment. Exiting!!`);
    }
    if (!rawAWSAccessKeyIDs) {
        throw new Error(`${envVars.AWS_ACCESS_KEY_IDS} is not set in environment. Exiting!!`);
    }
    if (!rawAWSSecretAccessKeys) {
        throw new Error(`${envVars.AWS_SECRET_ACCESS_KEYS} is not set in environment. Exiting!!`);
    }

    const distributionIDs = rawDistributionIDs.split(",").map(item => item.trim());
    const paths = rawPaths.split(",").map(item => item.trim());
    const awsRegions = rawAWSRegions.split(",").map(item => item.trim());
    const awsAccessKeyIDs = rawAWSAccessKeyIDs.split(",").map(item => item.trim());
    const awsSecretAccessKeys = rawAWSSecretAccessKeys.split(",").map(item => item.trim());

    awsAccessKeyIDs.forEach(item => core.setSecret(item));
    awsSecretAccessKeys.forEach(item => core.setSecret(item));

    const arrayLen = distributionIDs.length;

    if (distributionIDs.length * paths.length > 10) {
        throw new Error(`
        You're doing something very wrong!!
        This gh-action doesn't allow invalidating >10 distributions x path at once to avoid overage of AWS costs.
        `);
    }

    if (awsRegions.length !== arrayLen) {
        throw new Error(`${envVars.AWS_REGIONS} doesn't have same number of items as ${envVars.DISTRIBUTION_IDS}`);
    }
    if (awsAccessKeyIDs.length !== arrayLen) {
        throw new Error(`${envVars.AWS_ACCESS_KEY_IDS} doesn't have same number of items as ${envVars.DISTRIBUTION_IDS}`);
    }
    if (awsSecretAccessKeys.length !== arrayLen) {
        throw new Error(`${envVars.AWS_SECRET_ACCESS_KEYS} doesn't have same number of items as ${envVars.DISTRIBUTION_IDS}`);
    }
    return [distributionIDs, paths, awsRegions, awsAccessKeyIDs, awsSecretAccessKeys];
}

async function invalidateCloudfront(awsAccessKeyID, awsSecretAccessKey, awsRegion, distributionID, items) {
    const traceID = crypto.randomUUID();
    try {
        const cf = new aws.CloudFront({
            credentials: {
                accessKeyId: awsAccessKeyID,
                secretAccessKey: awsSecretAccessKey
            },
            region: awsRegion
        });
        console.log(`[${traceID}] cloudfront__invalidation: ` + distributionID);
        console.log(`[${traceID}] items: ` + items);
        const createInvalidationParams = {
            DistributionId: distributionID,
            InvalidationBatch: {
                CallerReference: new Date().getTime().toString(), /* required */
                Paths: {
                    Quantity: items.length,
                    Items: items
                }
            }
        };
        const invalidationReq = await cf.createInvalidation(createInvalidationParams);
        if (!!invalidationReq && !!invalidationReq.Invalidation && !!invalidationReq.Invalidation.Id) {
            const invalidationID = invalidationReq.Invalidation.Id;
            const getInvalidationParams = {
                DistributionId: distributionID,
                Id: invalidationID
            }

            let invalidationStatus = "InProgress"
            while (invalidationStatus === "InProgress") {
                await delay(delayDuration);
                console.log(`[${traceID}] Fetching CF Invalidation Status!!`)
                const invalidationResponse = await cf.getInvalidation(getInvalidationParams);
                if (!!invalidationResponse && !!invalidationResponse.Invalidation && !!invalidationResponse.Invalidation.Status) {
                    invalidationStatus = invalidationResponse.Invalidation.Status
                }
            }
            if (invalidationStatus !== "Completed") {
                throw new Error(`CF Invalidation Request unsuccessful!! Status: ${invalidationStatus}`);
            }
            console.log(`[${traceID}] CF Invalidation Request successful!!`)
            return;
        }
        throw new Error(`couldn't get invalidation req id`);
    } catch (err) {
        throw new Error(`[${traceID}] ${err.message}`, {err});
    }
}

(async () => {
    try {
        const [distributionIDs, paths, awsRegions, awsAccessKeyIDs, awsSecretAccessKeys] =
            validateInputs(rawDistributionIDs, rawPaths, rawAWSRegions, rawAWSAccessKeyIDs, rawAWSSecretAccessKeys);
        const arrayLen = distributionIDs.length;
        const promises = [];
        for (let idx = 0; idx < arrayLen; idx += 1) {
            const distributionID = distributionIDs[idx];
            const awsRegion = awsRegions[idx];
            const awsAccessKeyID = awsAccessKeyIDs[idx];
            const awsSecretAccessKey = awsSecretAccessKeys[idx];
            
            promises.push(invalidateCloudfront(awsAccessKeyID, awsSecretAccessKey, awsRegion, distributionID, paths));
        }
        const results = await Promise.allSettled(promises);
        let actionFailed = false;
        for (const result of results) {
            if (result.status === "rejected") {
                console.error(result.reason);
                actionFailed = true;
            }
        }
        if (actionFailed) {
            throw new Error("One or more errors occurred while invalidating Cloudfront CDN cache.");
        }
    } catch (error) {
        console.error(error);
        core.setFailed(error.message);
    }
})();
