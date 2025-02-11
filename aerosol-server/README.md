# Aerosol Server

## How to use

### After cloning the repository

1. Make sure your NodeJS is at least v16 (`node --version`).
2. `npm i -g pnpm` to install pnpm (the package manager)
3. Follow the steps required after every pull.

### After pulling

1. `pnpm i` to install dependencies.
2. Follow the steps required after making changes to the plugin.

### After making changes to the plugin

1. `pnpm run dev` to compile and run the server. After starting it will watch for changes and recompile if needed.


## Swagger UI

With SwaggerUi you can see the api documentation in a web interface. You can also test requests in the interface.

Just start the dev server following the steps above, then navigate to [http://localhost:27027/api-docs](http://localhost:27027/api-docs)
