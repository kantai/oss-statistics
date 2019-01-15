const fetch = require('cross-fetch')
const config = require('./config.json')
const fs = require('fs')

const github = 'https://api.github.com'

const org = config.org
const reposToSkip = config.reposToSkip
const internals = config.team

let API_KEY = config.apiKey
let repoData = false
let count = 0

const MS_IN_A_MONTH = Math.floor(1000 * 60 * 60 * 24 * 30.5)
const MS_IN_A_WEEK = Math.floor(1000 * 60 * 60 * 24 * 7)

function authFetch(url) {
  return fetch(url, { headers: {'Authorization': `token ${API_KEY}` } })
}

function updateStatus() {
  count += 1
}

async function getIssuePageData(repo, startPage, since) {
  updateStatus()
  const basisUrl = `${github}/repos/${org}/${repo}/issues?direction=asc&state=all&since=${since}`
  let issuePage = startPage
  const output = []

  while (true) {
    const pageResp = await authFetch(`${basisUrl}&page=${issuePage}`)
    const pageJSON = await pageResp.json()
    if (pageJSON.length <= 0) {
      break
    } else {
      pageJSON.forEach(x => output.push(x))
    }
    issuePage = issuePage + 1
    updateStatus()
  }

  return output
}

async function getAllRepos() {
  const basisUrl = `${github}/orgs/${org}/repos`
  let repoPage = 1
  const output = []
  while (true) {
    const pageResp = await authFetch(`${basisUrl}?page=${repoPage}`)
    const pageJSON = await pageResp.json()
    if (pageJSON.length <= 0) {
      break
    } else {
      pageJSON.forEach(x => {
        const repoName = x.name
        if (reposToSkip.indexOf(repoName) < 0) {
          output.push(repoName)
        }
      })
    }
    repoPage += 1
  }

  return output
}

function getIssueComments(repo, issue, since) {
  updateStatus()
  const url = since ?
        `${github}/repos/${org}/${repo}/issues/${issue}/comments?since=${since}`
        : `${github}/repos/${org}/${repo}/issues/${issue}/comments`
  return authFetch(url).then(x => x.json())
}

async function fetchStatisticsSince(sinceDate) {
//  const sinceDate = new Date(Date.now() - MS_IN_A_MONTH)
  const since = sinceDate.toISOString()
  const repoNames = await getAllRepos()

  const repos = await Promise.all(repoNames.map(name => {
    return getIssuePageData(name, 1, since)
      .then(issues => ({ name, issues }))
      .then(repo => {
        return Promise.all(
          repo.issues
            .filter(issue => isExternal(issue))
            .map(issue => {
              const createdDate = new Date(issue.created_at)
              return getIssueComments(repo.name, issue.number, sinceDate)
                .then(commentsData => Object.assign({}, issue, { commentsData }))
            }))
          .then(issues => ({ name: repo.name, issues }))
      })
  }))

  return repos
}

function isExternal(issue) {
  return internals.indexOf(issue.user.login) < 0
}

async function main() {
  const sinceDate = new Date(process.argv[2]);
  console.log(`Acquiring data since ${sinceDate}`)
  const data = await fetchStatisticsSince(sinceDate);
  fs.writeFileSync("./data.json", JSON.stringify(data, undefined, 2));
}

main()
