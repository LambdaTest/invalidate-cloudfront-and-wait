# Invalidate Cloudfront and Wait for Completion Action

A GitHub Workflow Action which invalidates Cloudfront distributions paths and wait for the completions AND it triggers all invalidations in parallel.
Set the following env (for multiple, provide them comma-separated):
1. AWS_REGIONS (*)
2. AWS_ACCESS_KEY_IDS (*)
3. AWS_SECRET_ACCESS_KEYS (*)
4. DISTRIBUTION_IDS (*)
5. DELAY - Defaults to 1000 ms

(*) - Required and number of comma-separated items should be same in all

## Usage

Sample workflow.

```yaml
name: Invalidate Cloudfront and Wait for Completion Action
on: push

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
    - name: checkout
      uses: actions/checkout@master

    - name: Invalidate Cloudfront and Wait for Completion Action
      uses: LambdaTest/invalidate-cloudfront-and-wait@v1.0.0
      env:
        AWS_REGIONS: 'us-east-1,us-east-1'
        AWS_ACCESS_KEY_IDS: ${{ secrets.AWS_ACCESS_KEY_ID }},${{ secrets.AWS_ACCESS_KEY_ID }}
        AWS_SECRET_ACCESS_KEYS: ${{ secrets.AWS_SECRET_ACCESS_KEY }},${{ secrets.AWS_ACCESS_KEY_ID }}
        DISTRIBUTION_IDS: ${{ secrets.DISTRIBUTION_ID_1 }},${{ secrets.DISTRIBUTION_ID_2 }}
        PATHS: '/a/*,/b/*,/c/*'
        DELAY: 10000
```

### AWS IAM Policy
Ensure that the AWS AccessKey and SecretKey being supplied has the following IAM Roles attached to it.

```json
{
    "Version": "2022-11-26",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                 "cloudfront:CreateInvalidation",
                 "cloudfront:GetInvalidation"
             ],
            "Resource": "arn:aws:cloudfront::<account id>:distribution/*"
        }
    ]
}
```
