Welcome to your new TanStack Start app!

# Getting Started

To run this application:

```bash
pnpm install
pnpm dev
```

# Building For Production

To build this application for production:

```bash
pnpm build
```

## Styling

This project uses [Tailwind CSS](https://tailwindcss.com/) for styling.

### Removing Tailwind CSS

If you prefer not to use Tailwind CSS:

1. Remove the demo pages in `src/routes/demo/`
2. Replace the Tailwind import in `src/styles.css` with your own styles
3. Remove `tailwindcss()` from the plugins array in `vite.config.ts`
4. Remove `@tailwindcss/vite` and `tailwindcss` from `package.json`

## Linting & Formatting

This project uses [Biome](https://biomejs.dev/) for linting and formatting. The following scripts are available:


```bash
pnpm lint
pnpm format
pnpm check
```


## Deploy to Vercel

The production build uses Nitro's Vercel preset and writes a Vercel Build Output
API bundle. The included `vercel.json` pins the frozen pnpm install and build
commands. Import the repository into Vercel and keep the output directory
setting empty so Vercel can detect Nitro's generated output.

Add these environment variables in the Vercel project's **Settings →
Environment Variables** for Production. If Preview deployments need database
access or authentication, configure Preview values too; use a separate
non-production database and a URL appropriate to the preview deployment.

- `DATABASE_URL`: the PostgreSQL connection URL. Use your provider's pooled
  connection URL for serverless deployments.
- `BETTER_AUTH_SECRET`: a private random secret; generate one with
  `pnpm dlx @better-auth/cli secret`.
- `BETTER_AUTH_URL`: the deployed app's canonical URL, such as
  `https://your-project.vercel.app`. Add the production domain after assigning
  it.

Apply the database migrations to the production database with `pnpm db:migrate`
before using authentication or saved trips. The project does not load local
`.env` files; provide required values through the process environment when
running commands locally, or through Vercel's Environment Variables for
deployments. Never put secrets in `VITE_` variables.


## Setting up Better Auth

1. Generate a private `BETTER_AUTH_SECRET` value:

   ```bash
   pnpm dlx @better-auth/cli secret
   ```

2. Visit the [Better Auth documentation](https://www.better-auth.com) to unlock the full potential of authentication in your app.

### Accounts and saved trips

Accounts, sessions, and saved trips use the PostgreSQL database configured by
`DATABASE_URL`. Set `BETTER_AUTH_SECRET` to a private random value (for example,
generate one with `pnpm dlx @better-auth/cli secret`) and apply the migrations:

```bash
pnpm db:migrate
```

After signing in, right-click map locations to build a multi-stop trip. Trips
can be reordered, saved to your account, and loaded later. Location
tracking and trip planning are only available to signed-in users.

Open the **Map key** on the map for marker meanings. Signed-in users can
right-click a map location to route to its nearest landmark or OpenStreetMap
place, then right-click again to add destinations and move the finish (up to
10 stops). Route stops snap to the selected place coordinates. Clicking map
places opens their details without changing the route. Map panning, zooming,
and rotation are disabled for direct user gestures; app controls still move
the map to places and route locations. Place detail pages show the English
name with its Arabic equivalent, use the stored description as a fallback, and
can load a larger photo gallery and sourced historical background from
Wikimedia Commons, Wikipedia, Wikidata, and Wikivoyage when matching references
are available. Place information searches alternate name forms and uses a
location-checked nearby Wikipedia article or Wikidata description when no
direct Wikipedia match is available. Photos use Commons matches and Wikipedia
article images with Commons attribution, with up to 16 images shown per place.
Photo credits and source
links are provided; places without a verified match are identified rather than
shown with an unrelated image.

Arabic place names are looked up using matching English labels or aliases in
Wikidata, then resolved from the entity’s Arabic label or Arabic Wikipedia
title. Unmatched places are shown as unavailable rather than machine-translated.

The map also lets you filter the available OpenStreetMap place records by
cafes, restaurants, hotels, shops, or other places. Place records load in
small batches so the full dataset does not have to fit in one page response;
the map shows loading progress and lets you retry if a batch fails. Zoom in to
explore nearby markers. Routes include driving directions with turn-by-turn
steps, estimated distance, and duration using the public OSRM routing service.

To download named OpenStreetMap points of interest for the map's current Egypt
bounding box and upsert them into `places`, set `DATABASE_URL`, apply the
migrations, then run:

```bash
pnpm db:import-osm-places
```

The importer requests tiles sequentially, recursively subdivides dense or
incomplete responses, and safely upserts each completed tile so interrupted
runs can be repeated. It includes named features tagged as amenities, tourism,
shops, leisure, historic, natural, places, offices, crafts, healthcare, sports,
public transport, railways, aeroways, and man-made features. OpenStreetMap does
not provide a canonical total for this selection, so the importer verifies
completion of its queried area rather than claiming a percentage of all
real-world locations. Place data is © OpenStreetMap contributors and is
available under the Open Database License (ODbL); see
https://www.openstreetmap.org/copyright.

To load the curated Egypt landmark dataset, apply the migrations, then run
`db/egypt_pois_seed.sql` followed by `db/egypt_pois_rich_seed.sql` against the
configured PostgreSQL database. The rich seed is safe to rerun without adding
duplicate place names. Place detail pages use stored photos. Curated POI map
popups show stored, attributed Wikimedia Commons photos and may search for more
when fewer than two are stored.

Run `pnpm db:enrich-images` to find and store credited Wikimedia Commons photos
for curated POIs that have fewer than two images. It reports progress and
continues until 80% of POIs have at least two photos or all POIs have been
checked; it fails if the target cannot be reached.

Run `pnpm db:enrich-egypt-pois` to store matching Wikipedia summaries and article
links and top up attributed photos for the curated Egypt POIs. It searches
Wikipedia using curated alternate names, gets the article summary in the same
request as the match, and uses a broader title/alias match for photos. Wikimedia
Commons is preferred, with Openverse as a fallback; stored images include their
source link, creator, and license. The script preserves curated descriptions and
existing image credits, processes only records that need enrichment, observes
Openverse's anonymous rate limit, and reports lookup failures.

Run `pnpm db:maintain-egypt-pois -- --dry-run` to preview curated POIs that have
neither a usable image nor substantive place information. Run
`pnpm db:maintain-egypt-pois` to replace generic descriptions with stored
Wikipedia summaries, translate and store missing Arabic names using
LibreTranslate, and remove only the previewed class of empty records. Set
`LIBRETRANSLATE_URL` to a reachable public LibreTranslate instance if the
default endpoint is unavailable; optionally set `LIBRETRANSLATE_API_KEY` when
the chosen instance requires one.

To add the supplementary Egyptian landmarks and their English and Arabic name
variations, run `pnpm db:migrate` and then apply
`db/egypt_pois_expansion.sql` to the configured PostgreSQL database. The
expansion skips existing canonical names, merges alternate names without
duplicates, and replaces only the generic descriptions on selected landmarks.
The map and places directory both search these stored variations.


## Shadcn

Add components using the latest version of [Shadcn](https://ui.shadcn.com/).

```bash
pnpm dlx shadcn@latest add button
```



## Routing

This project uses [TanStack Router](https://tanstack.com/router) with file-based routing. Routes are managed as files in `src/routes`.

### Adding A Route

To add a new route to your application just add a new file in the `./src/routes` directory.

TanStack will automatically generate the content of the route file for you.

Now that you have two routes you can use a `Link` component to navigate between them.

### Adding Links

To use SPA (Single Page Application) navigation you will need to import the `Link` component from `@tanstack/react-router`.

```tsx
import { Link } from "@tanstack/react-router";
```

Then anywhere in your JSX you can use it like so:

```tsx
<Link to="/about">About</Link>
```

This will create a link that will navigate to the `/about` route.

More information on the `Link` component can be found in the [Link documentation](https://tanstack.com/router/v1/docs/framework/react/api/router/linkComponent).

### Using A Layout

In the File Based Routing setup the layout is located in `src/routes/__root.tsx`. Anything you add to the root route will appear in all the routes. The route content will appear in the JSX where you render `{children}` in the `shellComponent`.

Here is an example layout that includes a header:

```tsx
import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'My App' },
    ],
  }),
  shellComponent: ({ children }) => (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <header>
          <nav>
            <Link to="/">Home</Link>
            <Link to="/about">About</Link>
          </nav>
        </header>
        {children}
        <Scripts />
      </body>
    </html>
  ),
})
```

More information on layouts can be found in the [Layouts documentation](https://tanstack.com/router/latest/docs/framework/react/guide/routing-concepts#layouts).

## Server Functions

TanStack Start provides server functions that allow you to write server-side code that seamlessly integrates with your client components.

```tsx
import { createServerFn } from '@tanstack/react-start'

const getServerTime = createServerFn({
  method: 'GET',
}).handler(async () => {
  return new Date().toISOString()
})

// Use in a component
function MyComponent() {
  const [time, setTime] = useState('')
  
  useEffect(() => {
    getServerTime().then(setTime)
  }, [])
  
  return <div>Server time: {time}</div>
}
```

## API Routes

You can create API routes by using the `server` property in your route definitions:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

export const Route = createFileRoute('/api/hello')({
  server: {
    handlers: {
      GET: () => json({ message: 'Hello, World!' }),
    },
  },
})
```

## Data Fetching

There are multiple ways to fetch data in your application. You can use TanStack Query to fetch data from a server. But you can also use the `loader` functionality built into TanStack Router to load the data for a route before it's rendered.

For example:

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/people')({
  loader: async () => {
    const response = await fetch('https://swapi.dev/api/people')
    return response.json()
  },
  component: PeopleComponent,
})

function PeopleComponent() {
  const data = Route.useLoaderData()
  return (
    <ul>
      {data.results.map((person) => (
        <li key={person.name}>{person.name}</li>
      ))}
    </ul>
  )
}
```

Loaders simplify your data fetching logic dramatically. Check out more information in the [Loader documentation](https://tanstack.com/router/latest/docs/framework/react/guide/data-loading#loader-parameters).



# Learn More

You can learn more about all of the offerings from TanStack in the [TanStack documentation](https://tanstack.com).

For TanStack Start specific documentation, visit [TanStack Start](https://tanstack.com/start).
