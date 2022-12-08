function buildURL(page: number) {
    return `https://registry.npmjs.com/-/v1/search?size=250&from=${page * 250}&popularity=1.0&quality=0.0&maintenance=0.0&text=boost-exact:false`;
}

const packages: unknown[] = []

for (let i = 0; i < 3; i++) {
    const request = await fetch(buildURL(i));

    const data = await request.json();

    const objects = data.objects

    packages = [...packages, objects]
}

await Deno.writeTextFile("./data.txt", JSON.stringify(packages))

console.log("Wrote to data.txt")