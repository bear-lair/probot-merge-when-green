import mergeWhenGreen from '../src/mergeWhenGreen'
import { MERGE_LABEL } from '../src/constants'

let context: any
let mockConfiguration: any

jest.mock('../src/configuration', () => ({
  getConfiguration: () => (mockConfiguration)
}))

beforeEach(() => {
  context = {
    config: jest.fn().mockImplementation((_fileName, defaultConfig) => Promise.resolve(defaultConfig)),
    github: {
      pulls: {
        get: jest.fn(),
        merge: jest.fn(),
        listReviewRequests: jest.fn()
      },
      checks: {
        listForRef: jest.fn()
      },
      repos: {
        getCombinedStatusForRef: jest.fn()
      },
      git: {
        deleteRef: jest.fn()
      }
    },
    repo: (obj: object) => {
      return Object.assign(
        {
          owner: 'owner',
          repo: 'repo'
        },
        obj
      )
    }
  }
})

test('skip not mergeable', async () => {
  const pr: any = {
    mergeable: false
  }
  await mergeWhenGreen(context, pr)

  expect(context.github.checks.listForRef).not.toHaveBeenCalled()
  expect(context.github.repos.getCombinedStatusForRef).not.toHaveBeenCalled()
  expect(context.github.pulls.merge).not.toHaveBeenCalled()
  expect(context.github.git.deleteRef).not.toHaveBeenCalled()
})

test('skip when no merge label', async () => {
  const pr: any = {
    mergeable: true,
    labels: []
  }
  await mergeWhenGreen(context, pr)

  expect(context.github.checks.listForRef).not.toHaveBeenCalled()
  expect(context.github.repos.getCombinedStatusForRef).not.toHaveBeenCalled()
  expect(context.github.pulls.merge).not.toHaveBeenCalled()
  expect(context.github.git.deleteRef).not.toHaveBeenCalled()
})

test('skip when failing checks but passing statuses', async () => {
  const checks = ['circleci']
  const statuses = ['jenkins']

  const pr: any = {
    number: 1,
    mergeable: true,
    labels: [{ name: MERGE_LABEL }],
    head: {
      ref: '3efb1d'
    }
  }

  mockConfiguration = {
    requiredChecks: checks,
    requiredStatuses: statuses
  }

  context.github.repos.getCombinedStatusForRef.mockResolvedValue(getSuccessStatuses(statuses))
  context.github.checks.listForRef.mockResolvedValue({
    data: {
      check_runs: [
        {
          status: 'completed',
          conclusion: 'failed',
          app: { owner: { login: 'circleci' } }
        }
      ]
    }
  })

  context.github.pulls.merge.mockResolvedValue({
    data: {
      merged: true
    }
  })
  await mergeWhenGreen(context, pr)

  expect(context.github.checks.listForRef).toHaveBeenCalled()
  expect(context.github.pulls.merge).not.toHaveBeenCalled()
  expect(context.github.git.deleteRef).not.toHaveBeenCalled()
})

test('skip when missing checks but passing statuses', async () => {
  const checks = ['circleci']
  const statuses = ['jenkins']

  const pr: any = {
    number: 1,
    mergeable: true,
    labels: [{ name: MERGE_LABEL }],
    head: {
      ref: '3efb1d'
    }
  }

  mockConfiguration = {
    requiredChecks: checks,
    requiredStatuses: statuses
  }

  context.github.repos.getCombinedStatusForRef.mockResolvedValue(getSuccessStatuses(statuses))
  context.github.checks.listForRef.mockResolvedValue({
    data: {
      check_runs: []
    }
  })

  context.github.pulls.merge.mockResolvedValue({
    data: {
      merged: true
    }
  })
  await mergeWhenGreen(context, pr)

  expect(context.github.checks.listForRef).toHaveBeenCalled()
  expect(context.github.pulls.merge).not.toHaveBeenCalled()
  expect(context.github.git.deleteRef).not.toHaveBeenCalled()
})

test('skip when passing checks but failing statuses', async () => {
  const checks = ['circleci']
  const statuses = ['jenkins']

  const pr: any = {
    number: 1,
    mergeable: true,
    labels: [{ name: MERGE_LABEL }],
    head: {
      ref: '3efb1d'
    }
  }

  mockConfiguration = {
    requiredChecks: checks,
    requiredStatuses: statuses
  }

  context.github.checks.listForRef.mockResolvedValue(getSuccessChecks(checks))
  context.github.repos.getCombinedStatusForRef.mockResolvedValue({
    data: {
      statuses: [
        {
          context: 'jenkins',
          state: 'failed'
        }
      ]
    }
  })

  context.github.pulls.merge.mockResolvedValue({
    data: {
      merged: true
    }
  })
  await mergeWhenGreen(context, pr)

  expect(context.github.repos.getCombinedStatusForRef).toHaveBeenCalled()
  expect(context.github.pulls.merge).not.toHaveBeenCalled()
  expect(context.github.git.deleteRef).not.toHaveBeenCalled()
})

test('skip when passing checks but missing statuses', async () => {
  const checks = ['circleci']
  const statuses = ['jenkins']

  const pr: any = {
    number: 1,
    mergeable: true,
    labels: [{ name: MERGE_LABEL }],
    head: {
      ref: '3efb1d'
    }
  }

  mockConfiguration = {
    requiredChecks: checks,
    requiredStatuses: statuses
  }

  context.github.checks.listForRef.mockResolvedValue(getSuccessChecks(checks))
  context.github.repos.getCombinedStatusForRef.mockResolvedValue({
    data: { statuses: [] }
  })

  context.github.pulls.merge.mockResolvedValue({
    data: {
      merged: true
    }
  })
  await mergeWhenGreen(context, pr)

  expect(context.github.repos.getCombinedStatusForRef).toHaveBeenCalled()
  expect(context.github.pulls.merge).not.toHaveBeenCalled()
  expect(context.github.git.deleteRef).not.toHaveBeenCalled()
})

test('skip when not all requested users reviewers have approved', async () => {
  const checks = ['circleci']
  const statuses = ['jenkins']

  const pr: any = {
    number: 1,
    labels: [{ name: MERGE_LABEL }],
    head: {
      ref: '3efb1d'
    }
  }

  mockConfiguration = {
    requiredChecks: checks,
    requiredStatuses: statuses,
    requireApprovalFromRequestedReviewers: true
  }

  context.github.checks.listForRef.mockResolvedValue(getSuccessChecks(checks))
  context.github.repos.getCombinedStatusForRef.mockResolvedValue(getSuccessStatuses(statuses))

  context.github.pulls.listReviewRequests.mockResolvedValue({ data: { users: ['Iron Man'], teams: [] } })

  await mergeWhenGreen(context, pr)

  expect(context.github.pulls.merge).not.toHaveBeenCalled()
  expect(context.github.git.deleteRef).not.toHaveBeenCalled()
})

test('skip when not all requested team reviewers have approved', async () => {
  const checks = ['circleci']
  const statuses = ['jenkins']

  const pr: any = {
    number: 1,
    labels: [{ name: MERGE_LABEL }],
    head: {
      ref: '3efb1d'
    }
  }

  mockConfiguration = {
    requiredChecks: checks,
    requiredStatuses: statuses,
    requireApprovalFromRequestedReviewers: true
  }

  context.github.checks.listForRef.mockResolvedValue(getSuccessChecks(checks))
  context.github.repos.getCombinedStatusForRef.mockResolvedValue(getSuccessStatuses(statuses))

  context.github.pulls.listReviewRequests.mockResolvedValue({ data: { users: [], teams: ['The Avengers'] } })

  await mergeWhenGreen(context, pr)

  expect(context.github.pulls.merge).not.toHaveBeenCalled()
  expect(context.github.git.deleteRef).not.toHaveBeenCalled()
})

test('merge pull requests when passing checks and statuses', async () => {
  const checks = ['circleci']
  const statuses = ['jenkins']

  const pr: any = {
    number: 1,
    mergeable: true,
    labels: [{ name: MERGE_LABEL }],
    head: {
      ref: '3efb1d'
    }
  }

  mockConfiguration = {
    requiredChecks: checks,
    requiredStatuses: statuses
  }

  context.github.checks.listForRef.mockResolvedValue(getSuccessChecks(checks))
  context.github.repos.getCombinedStatusForRef.mockResolvedValue(getSuccessStatuses(statuses))

  context.github.pulls.merge.mockResolvedValue({
    data: {
      merged: true
    }
  })

  await mergeWhenGreen(context, pr)

  expect(context.github.checks.listForRef).toHaveBeenCalled()
  expect(context.github.repos.getCombinedStatusForRef).toHaveBeenCalled()
  expect(context.github.pulls.merge).toHaveBeenCalled()
  expect(context.github.git.deleteRef).toHaveBeenCalled()
})

test('merge pull requests when passing custom statuses', async () => {
  const checks: string[] = []
  const statuses = ['ci/gitlab/gitlab.com']

  const pr: any = {
    number: 1,
    mergeable: true,
    labels: [{ name: MERGE_LABEL }],
    head: {
      ref: '3efb1d'
    }
  }

  mockConfiguration = {
    requiredChecks: checks,
    requiredStatuses: statuses
  }

  context.github.checks.listForRef.mockResolvedValue(getSuccessChecks(checks))
  context.github.repos.getCombinedStatusForRef.mockResolvedValue(getSuccessStatuses(statuses))
  context.github.pulls.merge.mockResolvedValue({ data: { merged: true } })

  await mergeWhenGreen(context, pr)

  expect(context.github.checks.listForRef).toHaveBeenCalled()
  expect(context.github.repos.getCombinedStatusForRef).toHaveBeenCalled()
  expect(context.github.pulls.merge).toHaveBeenCalled()
  expect(context.github.git.deleteRef).toHaveBeenCalled()
})

test('skip when missing custom statuses', async () => {
  const checks: string[] = []
  const statuses = ['ci/gitlab/gitlab.com']

  const pr: any = {
    number: 1,
    mergeable: true,
    labels: [{ name: MERGE_LABEL }],
    head: {
      ref: '3efb1d'
    }
  }

  mockConfiguration = {
    requiredChecks: checks,
    requiredStatuses: statuses
  }

  context.github.checks.listForRef.mockResolvedValue({ data: { check_runs: [] } })
  context.github.repos.getCombinedStatusForRef.mockResolvedValue({ data: { statuses: [] } })
  context.github.pulls.merge.mockResolvedValue({ data: { merged: true } })

  await mergeWhenGreen(context, pr)

  expect(context.github.repos.getCombinedStatusForRef).toHaveBeenCalled()
  expect(context.github.pulls.merge).not.toHaveBeenCalled()
  expect(context.github.git.deleteRef).not.toHaveBeenCalled()
})

test('merge pull requests when passing checks and statuses and all requested reviews have approved', async () => {
  const checks = ['circleci']
  const statuses = ['jenkins']

  const pr: any = {
    number: 1,
    mergeable: true,
    labels: [{ name: MERGE_LABEL }],
    head: {
      ref: '3efb1d'
    }
  }

  mockConfiguration = {
    requiredChecks: checks,
    requiredStatuses: statuses,
    requireApprovalFromRequestedReviewers: true
  }

  context.github.checks.listForRef.mockResolvedValue(getSuccessChecks(checks))
  context.github.repos.getCombinedStatusForRef.mockResolvedValue(getSuccessStatuses(statuses))
  context.github.pulls.listReviewRequests.mockResolvedValue({ data: { users: [], teams: [] } })

  context.github.pulls.merge.mockResolvedValue({
    data: {
      merged: true
    }
  })

  await mergeWhenGreen(context, pr)

  expect(context.github.pulls.merge).toHaveBeenCalled()
  expect(context.github.git.deleteRef).toHaveBeenCalled()
})

function getSuccessStatuses (statuses: string[]) {
  const data = {
    statuses: statuses.map((statusName) => {
      return {
        context: statusName,
        state: 'success'
      }
    })
  }

  return {
    data: data
  }
}

function getSuccessChecks (checks: string[]) {
  const data = checks.map((checkName) => {
    return {
      status: 'completed',
      conclusion: 'success',
      app: { owner: { login: checkName } }
    }
  })

  return {
    data: {
      check_runs: data
    }
  }
}
