const sequelize = require('../../test/helpers/sequelize')

const User = sequelize.models.User
const Article = sequelize.models.Article
const Comment = sequelize.models.Comment
const cacheStore = User.cache().client().store

beforeAll(() => sequelize.sync())

describe('Class methods', () => {

  expect(cacheStore).toEqual({}, 'Cache is empty on start')

  test('Create', async () => {
    const user = await User.cache().create({
      id: 1,
      name: 'Daniel'
    })

    const article = await Article.cache().create({
      uuid: '2086c06e-9dd9-4ee3-84b9-9e415dfd9c4c',
      title: 'New article'
    })
    await user.setArticles([article])
    await user.cache().save()

    const comment = await Comment.cache().create({
      userId: user.id,
      articleUuid: article.uuid,
      body: 'New comment'
    })

    expect(cacheStore.User[1]).toEqual(
      user.get(),
      'User with default primary key cached after create'
    )
    expect(cacheStore.Article[article.uuid]).toEqual(
      article.get(),
      'Entity with custom primary key cached after create'
    )
    expect(cacheStore.Comment[`${comment.userId},${comment.articleUuid}`]).toEqual(
      comment.get(),
      'Entity with composite primary keys cached after create'
    )
    expect((await User.cache().findByPk(1)).get()).toEqual(
      user.get(),
      'Cached user with primary key correctly loaded'
    )
    expect((await Article.cache().findByPk(article.uuid)).get()).toEqual(
      article.get(),
      'Cached entity correctly loaded using custom primary key'
    )
  })

  test('Upsert', async () => {
    const user = await User.cache().findByPk(1)

    await User.cache().upsert({
      id: 1,
      name: 'Ivan'
    })

    expect((await User.cache().findByPk(1)).get()).toEqual(
      (await User.findByPk(1)).get(),
      'Timestamps synced after upsert'
    )

    await user.cache().reload()

    expect(user.name).toBe('Ivan', 'User name was updated')

    expect(cacheStore.User[1]).toEqual(
      user.get({ plain: true }), // TODO fix loading superfluous data
      'User cached after upsert'
    )
  })

  test('findByPk', async () => {
    expect(await User.cache().findByPk(2)).toBeNull() // Cache miss not causing any problem

    delete cacheStore.User[1]
    // Deleted so first find goes directly to DB & and second one retrieves from cache with association

    const getQuery = async () => {
      const user = await User.cache().findByPk(1, { include: [{ model: Article, as: 'Articles' }] })
      return user.get().Articles[0].get().uuid
    }

    expect(await getQuery()).toBe(
      await getQuery(),
      'Retrieved user with Article association'
    )
  })

  test('cache -> findAll', async () => {
    const missingUsers = await User.cache('missingKey1').findAll({ where: { name: 'Not existent' } })

    expect(missingUsers).toEqual(
      [],
      'Cache miss not causing any problem'
    )

    const key = 'IvanUserCacheKey1'
    const getQuery = () => ({
      where: { name: 'Ivan' },
      include: [{ model: Article, as: 'Articles' }]
    })

    const [cacheMiss] = await User.cache(key).findAll(getQuery())
    const [cacheHit] = await User.cache(key).findAll(getQuery())
    const [dbValue] = await User.findAll(getQuery())

    expect(cacheMiss.get().Articles[0].get().uuid).toBe(
      cacheHit.get().Articles[0].get().uuid,
      'Returned value is the same, not matter if cache hit or miss'
    )

    expect(cacheHit.get().Articles[0].get().uuid).toBe(
      dbValue.get().Articles[0].get().uuid,
      'Returned value is the same, as in db'
    )
  })

  test('cache -> findOne', async () => {
    const missingUser = await User.cache('MissingKey2').findOne({ where: { name: 'Not existent' } })

    expect(missingUser).toBeNull() // Cache miss not causing any problem

    const key = 'IvanUserCacheKey2'
    const getQuery = () => ({
      where: { name: 'Ivan' },
      include: [{ model: Article, as: 'Articles' }]
    })

    const cacheMiss = await User.cache(key).findOne(getQuery())
    const cacheHit = await User.cache(key).findOne(getQuery())
    const dbValue = await User.findOne(getQuery())

    expect(cacheMiss.get().Articles[0].get().uuid).toBe(
      cacheHit.get().Articles[0].get().uuid,
      'Returned value is the same, not matter if cache hit or miss'
    )

    expect(cacheHit.get().Articles[0].get().uuid).toBe(
      dbValue.get().Articles[0].get().uuid,
      'Returned value is the same, as in db'
    )
  })

  test('cache -> cache store', async () => {
    const key = 'ClearStoreUserCacheKey'
    const cacheStore = User.cache().client().store
    const manualTest = await User.cache(key).findOne({ where: { name: 'Ivan' } })

    expect(cacheStore.User[key]).toEqual(
      manualTest.get(),
      'User cached after find and present in key using cache store'
    )
  })

  test('cache -> clear', async () => {
    const key = 'ClearUserCacheKey'
    const manualTest = await User.cache(key).findOne({ where: { name: 'Ivan' } })

    expect(cacheStore.User[key]).toEqual(
      manualTest.get(),
      'User cached after find and present in key'
    )

    await User.cache(key).clear()
    expect(cacheStore.User[key]).toBeUndefined() // User was deleted from cache
  })
})
