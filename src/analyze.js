const fs = require('fs')
const fetch = require('cross-fetch')

const API_KEY = '77e2b692be340f9f0317780e5ac4354327c25a0d'
const dataFile = './data.json'
const org = 'blockstack'
const github = 'https://api.github.com'


function loadData() {
  try {
    return JSON.parse(fs.readFileSync(dataFile))
  } catch (err) {
    return {}
  }
}

const MS_IN_A_MONTH = Math.floor(1000 * 60 * 60 * 24 * 61)

function median(x) {
  if (x.length === 0) {
    return 0
  }
  x.sort()
  if (x.length % 2 == 0) {
    return (x[Math.floor(x.length/2)] + x[Math.floor(x.length/2)+1])/2
  } else {
    return x[Math.floor(x.length/2) + 1]
  }
}

function getIssuesStats(issues) {
  const total = issues.length
  const closed = issues.filter(issue => issue.state === 'closed').length
  const daysToFirstResponse = issues.map(issue => {
    if (issue.commentsData && issue.commentsData.length >= 1) {
      const issueDate = new Date(issue.created_at)
      const firstReply = new Date(issue.commentsData[0].created_at)
      return (firstReply - issueDate) / (1000 * 60 * 60 * 24)
    } else {
      return false
    }
  })
  const daysToClose = issues.map(issue => {
    if (issue.state === 'closed') {
      const issueDate = new Date(issue.created_at)
      const firstReply = new Date(issue.closed_at)
      return (firstReply - issueDate) / (1000 * 60 * 60 * 24)
    } else {
      return false
    }
  })
  const issuesWithoutResponse = daysToFirstResponse.filter(x => x === false).length
  const medianDaysToFirstResponse = median(daysToFirstResponse.filter(x => x !== false))
  const medianDaysToClose = median(daysToFirstResponse.filter(x => x !== false))
  return {
    issuesWithoutResponse,
    issuesOpen: total - closed,
    issuesClosed: closed,
    medianDaysToClose: Math.round(10*medianDaysToClose)/10,
    medianDaysToFirstResponse: Math.round(10*medianDaysToFirstResponse)/10
  }
}

const internals = [
  'jeffdomke',
  'aulneau',
  'friedger',
  'larrysalibra',
  'jcnelson',
  'kantai',
  'moxiegirl',
  'markmhx',
  'shea256',
  'hstove',
  'yknl',
  'shreyasthiagaraj',
  'cwackerfuss',
  'muneeb-ali',
  'guylepage3',
  'wbobeirne',
  'muneebm',
  'wileyj',
  'shanvoight',
  'jackzampolin',
  'cuevasm',
  'altuncu' ]

function isExternal(issue) {
  return internals.indexOf(issue.user.login) < 0
}

function print(stats) {
  const padding = [4, 6, 11, 13, 16]
  const statRow = [stats.issuesOpen, stats.issuesClosed, stats.issuesWithoutResponse,
                   stats.medianDaysToClose, stats.medianDaysToFirstResponse]

  let output = ''
  for (let i = 0; i < padding.length; i++) {
    output += `${statRow[i]}`.padStart(padding[i]) + ' | '
  }

  return output
}

function analyze(repos) {
  const sinceDate = new Date(Date.now() - MS_IN_A_MONTH)
  const allIssues = []
  const externalIssues = []
  const allPRs = []
  const externalPRs = []

  const repoAnalysis = repos.map(repo => {
    const issues = repo.issues.filter(x => {
      return (new Date(x.created_at) - sinceDate >= 0)
    }).filter(x => !(x.pull_request))

    const prs = repo.issues.filter(x => {
      return (new Date(x.created_at) - sinceDate >= 0)
    }).filter(x => x.pull_request)

    const allStats = getIssuesStats(issues)
    const issuesOpenedByOthers = issues.filter(x => isExternal(x))
    const externalStats = getIssuesStats(issuesOpenedByOthers)

    const allStatsPRs = getIssuesStats(prs)
    const PRsOpenedByOthers = prs.filter(x => isExternal(x))
    const externalStatsPrs = getIssuesStats(PRsOpenedByOthers)

    issues.forEach(x => allIssues.push(x))
    issuesOpenedByOthers.forEach(x => externalIssues.push(x))

    prs.forEach(x => allPRs.push(x))
    PRsOpenedByOthers.forEach(x => externalPRs.push(x))

    return { name: repo.name,
             allStats, externalStats,
             allStatsPRs, externalStatsPrs }
  })

  const sumAnalysis = {
    allStats: getIssuesStats(allIssues),
    externalStats: getIssuesStats(externalIssues),
    allPRStats: getIssuesStats(allPRs),
    externalPRStats: getIssuesStats(externalPRs)
  }

  console.log(`Statistics for issues/PRs created since ${sinceDate}`)
  console.log('---------------------------------------------------------------------------------------------------------------------------------------------------------')
  console.log(`|                     |                        issues                                  |                         PRs                                     |`)
  console.log(`|                     | open | closed | no response | days to close | days to response | open | closed | no response | days to close | days to response  |`)
  console.log('---------------------------------------------------------------------------------------------------------------------------------------------------------')
  console.log(`| All issues          | ${print(sumAnalysis.allStats)}${print(sumAnalysis.allPRStats)}`)
  console.log(`| External            | ${print(sumAnalysis.externalStats)}${print(sumAnalysis.externalPRStats)}`)
  console.log('---------------------------------------------------------------------------------------------------------------------------------------------------------')
  console.log()
  console.log()
  console.log('---------------------------------------------------------------------------------------------------------------------------------------------------------')
  console.log(`|                     |                        issues                                  |                         PRs                                     |`)
  console.log(`|                     | open | closed | no response | days to close | days to response | open | closed | no response | days to close | days to response  |`)
  console.log('---------------------------------------------------------------------------------------------------------------------------------------------------------')

  repoAnalysis.forEach(repo => {
    if (repo.allStats.issuesOpen + repo.allStats.issuesClosed > 0) {
      console.log(`| ${repo.name.padStart(20).slice(0, 20)}| ${print(repo.allStats)}${print(repo.allStatsPRs)}`)
      console.log(`| External            | ${print(repo.externalStats)}${print(repo.externalStatsPrs)}`)
      console.log('---------------------------------------------------------------------------------------------------------------------------------------------------------')
    }
  })
}


analyze(loadData().repos)
