async function fileExists (filepath) {
    try {
        const file = await Deno.stat(filepath);
        return file.isFile();
    } catch (e) {
        return false
    }
}
async function execute (v) {
    const p = Deno.run({
        cmd: v
    });
    const { success, code } = await p.status();
    let result = {};
    result.success = success;
    result.code = code;
    return result;
}
async function executePipe (v) {
    const p = Deno.run({
        cmd: v,
        stdout: "piped",
        stderr: "piped",
    });
    const { success, code } = await p.status();
    let result = {};
    result.success = success;
    result.code = code;
    const rawOutput = await p.output();
    result.stdout = new TextDecoder("shift-jis").decode(rawOutput);
    const rawError = await p.stderrOutput();
    result.stderr = new TextDecoder("shift-jis").decode(rawError);
    return result;
}
let cwd = Deno.cwd();
await execute(["gh.exe", "auth", "login", "--hostname", "github.com"]); // use GH_TOKEN env variable
let buildDir = cwd + "\\.build";
Deno.mkdir(buildDir, { recursive: true });
async function scoopAppInfo (key, path) {
    await execute(["cmd.exe", "/c", "scoop", "install", key]);
    await execute(["cmd.exe", "/c", "scoop", "update", key]);
    let st = await executePipe(["scoop-console-x86_64-static.exe", "--latest", key]);
    let list = st.stdout.trim().split(" ");
    let version = list[0];
    let dir = list[1];
    let url = `https://github.com/spider-explorer/spider-programs-2/releases/download/64bit/${key}-${version}.zip`;
    st = await executePipe(["curl.exe", url, "-o", "/dev/null", "-w", "%{http_code}", "-s"]);
    return { "name" : key, "path" : path, "version" : version, "dir" : dir, "url" : url, "exists" : st.stdout != "404" };
}
await execute(["cmd.exe", "/c", "scoop", "install", "git"]);
await execute(["cmd.exe", "/c", "scoop", "bucket", "add", "main"]);
await execute(["cmd.exe", "/c", "scoop", "bucket", "add", "extras"]);
await execute(["cmd.exe", "/c", "scoop", "bucket", "add", "java"]);
let programs = JSON.parse(await Deno.readTextFile('programs.json'));
let result = [];
for (var rec of programs)
{
    console.log(rec);
    let app = await scoopAppInfo(rec[0], rec[1]);
    console.log(app);
    let url_parts = app.url.split(".");
    let ext = url_parts[url_parts.length - 1];
    result.push({ "name" : app.name, "version" : app.version, "path" : app.path, "url" : app.url, "ext" : ext });
    if (!app.exists)
    {
        Deno.chdir(app.dir);
        await execute(["cmd.exe", "/c", "dir"]);
        if (await fileExists("IDE/bin/idea.properties")) {
            await execute(["sed", "-i",
                           "-e", "s/^idea[.]config[.]path=/#\\\\0/g",
                           "-e", "s/^idea[.]system[.]path=/#\\\\0/g",
                           "-e", "s/^idea[.]plugins[.]path=/#\\\\0/g",
                           "-e", "s/^idea[.]log[.]path=/#\\\\0/g", "IDE/bin/idea.properties"]);
        }
        let archive = buildDir + `\\${app.name}-${app.version}.zip`;
        if (app.name == "busybox") {
          let tmpDir = `${buildDir}\\${app.name}-${app.version}`;
          Deno.mkdir(tmpDir, { recursive: true });
          Deno.chdir(tmpDir);
          await execute([`${app.dir}/busybox.exe`, "--install", "."]);
        }
        if (!await fileExists(archive)) await execute(["7z.exe", "a", "-r", "-tzip", "-mcu=on", archive, "*", "-x!User Data", "-x!profile", "-x!distribution"]);
        console.log("(1)");
        Deno.chdir(cwd);
        console.log("(2)");
        await execute(["gh.exe", "release", "upload", "64bit", archive]);
        console.log("(3)");
    }
}
Deno.chdir(cwd);
Deno.writeTextFile("00-software.json", JSON.stringify({ "software" : result }, null, 2));
await execute(["gh.exe", "release", "upload", "64bit", "00-software.json", "--clobber"]);
