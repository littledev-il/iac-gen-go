Using claude code sdk in Typescript, I want to create a IaC (For AWS) code generator tool which reads a prompt
and create a cdktf go code base.
Plan: 
- Analyse the /Users/anshukkumar/Projects/fl/iac-test-automations2/templates/cdk-go folder. This would be our placeholder structure for creating our code.
- Analyse the /Users/anshukkumar/Projects/fl/iac-test-automations2/.github/workflows/ci-cd.yml and also the /Users/anshukkumar/Projects/fl/iac-test-automations2/scripts/
- Directory structure should be like same as template.
Execution Environment:
- An ssh mcp server needs to be implemented.
- Agent will run in a jump box hosted in aws environment.
- You can create a publically accessible github (user: w) repo which can be pulled/cloned inside the jump box.
Implement:
- In package.json prepare the following commands build, synth, lint and deploy.
- The Agent needs to run the following cycle until expected deployment is successful:
- - Step 1: Generate/Update the code as per prompt.
- - Step 2: Build the code, if successful then go to next step else fix the issue and build again.
- - Step 3: Synth the code, if successful then go to next step else fix the issue and synth again.
- - Step 4: Lint the code, if successful then go to next step else fix the issue and lint again.
- - Step 5: Deploy the code. 
- - Step 5a: If successful check the expectation from prompt if met. If yes then end the cycle. If no then go to Step 1.
- - Step 5b: If deployment not successful fix the issue (you may use aws cli commands for cleanup of any aws resources but the IaC code should be complete in itself) and go to step 5.