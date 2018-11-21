const fs = require('fs')
const fetch = require('cross-fetch')

const API_KEY = process.env['API_KEY']
const dataFile = './data.json'
const org = 'blockstack'
const github = 'https://api.github.com'

const repoNames = [
  "secret-sharing",
  "blockstack",
  "blockstack-ruby",
  "python-utilitybelt",
  "blockstack.js",
  "atlas",
  "blockstack-core",
  "gaia",
  "blockstack.org",
  "keychain-manager-js",
  "virtualchain",
  "key-encoder-js",
  "jsontokens-js",
  "reading-list",
  "blockstack-proofs-py",
  "blockstack-browser",
  "packaging",
  "blockstack-bootstrap",
  "zone-file-js",
  "blockstack-stats",
  "zone-file-py",
  "keylib-py",
  "blockstack-explorer",
  "blockstack-utxo",
  "blockstack-files",
  "blockchainprotocols.org",
  "designs",
  "blockstack.org-api",
  "blockstack-consensus-data",
  "pybitcoin",
  "secret-sharing",
  "blockstack",
  "blockstack-ruby",
  "python-utilitybelt",
  "blockstack.js",
  "atlas",
  "blockstack-core",
  "gaia",
  "blockstack.org",
  "keychain-manager-js",
  "virtualchain",
  "key-encoder-js",
  "jsontokens-js",
  "reading-list",
  "blockstack-proofs-py",
  "blockstack-browser",
  "packaging",
  "blockstack-bootstrap",
  "zone-file-js",
  "blockstack-stats",
  "zone-file-py",
  "keylib-py",
  "blockstack-explorer",
  "blockstack-utxo",
  "blockstack-files",
  "blockchainprotocols.org",
  "designs",
  "blockstack.org-api",
  "blockstack-consensus-data",
  "ruby-jwt-blockstack",
  "blockstack-storage-js",
  "omniauth-blockstack",
  "discourse-blockstack",
  "blockstack-app-generator",
  "updates.blockstack.org",
  "design-system",
  "atlas-monitor",
  "BlockstackCoreApi-iOS-deprecated",
  "blockstack-todos",
  "evangelists",
  "blockstack.go",
  "kube-integration-tests",
  "subdomain-registrar",
  "transaction-broadcaster",
  "blockstack-ios",
  "blockstack-android",
  "whitepaper",
  "app.co",
  "app.co-api",
  "blockstack-react-native",
  "website-starter-kit",
  "docs.blockstack",
  "blockstack-trezor-signer",
  "blockstack-ledger-signer",
  "c32check",
  "cli-blockstack",
]

function authFetch(url) {
  return fetch(url, { headers: {'Authorization': `token ${API_KEY}` } })
}

function loadData() {
  try {
    return JSON.parse(fs.readFileSync(dataFile))
  } catch (err) {
    return {}
  }
}

function storeData(data) {
  try {
    const timestamp = Math.floor((new Date()).getTime() / 1000)
    fs.copyFileSync(dataFile, `${dataFile}.${timestamp}`)
  } catch (err) {
    console.log('Failed to backup ${dataFile}. Overwriting.')
  }
  fs.writeFileSync(dataFile, JSON.stringify(data, undefined, 2))
}

async function getIssuePageData(repo, startPage, since) {
  console.log(`Fetching issues for ${repo}`)
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
    console.log(`.`)
  }

  return output
}

function getIssueComments(repo, issue) {
  const url = `${github}/repos/${org}/${repo}/issues/${issue}/comments`
  return authFetch(url).then(x => x.json())
}

const MS_IN_A_MONTH = Math.floor(1000 * 60 * 60 * 24 * 61)

async function fetchMonthStatistics() {
  const sinceDate = new Date(Date.now() - MS_IN_A_MONTH)
  const since = sinceDate.toISOString()

  const repos = await Promise.all(repoNames.map(name => {
    return getIssuePageData(name, 0, since)
      .then(issues => ({ name, issues }))
      .then(repo => {
        return Promise.all(repo.issues.map(issue => {
          const createdDate = new Date(issue.created_at)
          if (createdDate - sinceDate >= 0) {
            return getIssueComments(repo.name, issue.number)
              .then(commentsData => Object.assign({}, issue, { commentsData }))
          } else {
            return Promise.resolve(issue)
          }
        }))
          .then(issues => ({ name: repo.name, issues }))
      })
  }))

  storeData({ repos })
}


fetchMonthStatistics()
