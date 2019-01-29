# What this script does

This script will pull all the issues and PRs created during a specific
date range, find whether those issues have been responded to (and how
quickly) and whether or not the issues are still open. It will filter
out issues created by configured team members. 

# Running with docker-compose

Clone this repo and cd into it:

```bash
$ git clone https://github.com/kantai/oss-statistics.git
$ cd oss-statistics
```

Make a directory `data/` and copy your `config.json` into it.

```bash
$ mdkir data
$ cp config.json.example data/config.json
```

Edit the `config.json` to your liking. *Important*, you must add
your [Github API key](https://github.com/settings/tokens). You should
generate an access token without any permissions (i.e., a "public access"
key).


You can edit your API key from the commandline like follows:

```bash
$ sed -i -e 's/EXAMPLE_API_KEY/YOUR_ACTUAL_API_KEY/' data/config.json
```

Or just open `config.json` in your text editor.


Now that you've set up your `config.json`, you should be able to run the analysis
with:

```
$ docker-compose build && docker-compose up
```

You can edit the date range for the analysis by modifying the `docker-compose.yaml` file.

This script will output some summary statistics to the command line. It will also output a CSV with per-repo statistics to the `/data/` directory.

