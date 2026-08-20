# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/c85988df-ea73-4aaa-aee1-a0287fd7c653

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/c85988df-ea73-4aaa-aee1-a0287fd7c653) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/c85988df-ea73-4aaa-aee1-a0287fd7c653) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/tips-tricks/custom-domain#step-by-step-guide)

## Testing

Firestore security rules are covered by a test suite in `tests/`.

```sh
npm test
```

This starts the Firestore emulator on port **8085** (configured in `firebase.json`),
runs the suite against it, and shuts the emulator down again. Nothing touches the
production project, and no network access or Firebase login is required.

**Prerequisite:** the Firestore emulator is a Java program, so a JDK (version 11 or
newer) must be installed and on your `PATH`. Verify with `java -version`. If that
command reports no runtime, install a JDK via your platform's usual package manager
and make sure its `bin` directory is on your `PATH`.

Use `npm run test:watch` to re-run the suite as you edit rules, and
`npm run rules:deploy` to publish `firestore.rules` and `firestore.indexes.json`
to the production project.
