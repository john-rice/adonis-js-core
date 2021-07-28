/*
 * @adonisjs/core
 *
 * (c) Harminder Virk <virk@adonisjs.com>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import 'reflect-metadata'
import test from 'japa'
import etag from 'etag'
import { join } from 'path'
import { Readable } from 'stream'
import supertest from 'supertest'
import { createServer } from 'http'

import { setupApp, fs, registerBodyParserMiddleware } from '../test-helpers'
import { MemoryDriver } from '../src/Drive/Drivers/Memory'
import { LocalFileServer } from '../src/Drive/LocalFileServer'
import { promisify } from 'util'

const TEST_ROOT = join(__dirname, '__app')

test.group('Memory driver | put', (group) => {
  group.afterEach(async () => {
    await fs.cleanup()
  })

  test('write file to the destination', async (assert) => {
    const app = await setupApp()
    const router = app.container.resolveBinding('Adonis/Core/Route')
    const config = { driver: 'memory' as const, root: TEST_ROOT, visibility: 'public' as const }

    const driver = new MemoryDriver('local', config, router)
    await driver.put('foo.txt', 'hello world')

    const contents = await driver.get('foo.txt')
    assert.equal(contents.toString(), 'hello world')
  })

  test('create intermediate directories when missing', async (assert) => {
    const app = await setupApp()
    const router = app.container.resolveBinding('Adonis/Core/Route')
    const config = { driver: 'memory' as const, root: TEST_ROOT, visibility: 'public' as const }

    const driver = new MemoryDriver('local', config, router)
    await driver.put('bar/baz/foo.txt', 'hello world')

    const contents = await driver.get('bar/baz/foo.txt')
    assert.equal(contents.toString(), 'hello world')
  })

  test('overwrite destination when file already exists', async (assert) => {
    const app = await setupApp()
    const router = app.container.resolveBinding('Adonis/Core/Route')
    const config = { driver: 'memory' as const, root: TEST_ROOT, visibility: 'public' as const }

    const driver = new MemoryDriver('local', config, router)
    await driver.put('foo.txt', 'hi world')
    await driver.put('foo.txt', 'hello world')

    const contents = await driver.get('foo.txt')
    assert.equal(contents.toString(), 'hello world')
  })
})

test.group('Local driver | putFile', (group) => {
  group.afterEach(async () => {
    await fs.cleanup()
  })

  test('move file from outside the disk root to disk', async (assert) => {
    const app = await setupApp()
    const router = app.container.resolveBinding('Adonis/Core/Route')
    const config = { driver: 'memory' as const, root: TEST_ROOT, visibility: 'public' as const }
    const adonisServer = app.container.resolveBinding('Adonis/Core/Server')
    const driver = new MemoryDriver('local', config, router)
    const server = createServer(adonisServer.handle.bind(adonisServer))

    router.post('/', async ({ request }) => {
      await driver.putFile(request.file('file')!)
      return request.file('file')
    })

    registerBodyParserMiddleware(app)
    adonisServer.optimize()

    await fs.add('foo.txt', 'hello world')

    const { body } = await supertest(server)
      .post('/')
      .attach('file', join(fs.basePath, 'foo.txt'))
      .expect(200)

    assert.equal(body.state, 'moved')
    assert.property(body, 'filePath')
    assert.property(body, 'fileName')
  })

  test('create intermediate directories when missing', async (assert) => {
    const app = await setupApp()
    const router = app.container.resolveBinding('Adonis/Core/Route')
    const config = { driver: 'memory' as const, root: TEST_ROOT, visibility: 'public' as const }
    const adonisServer = app.container.resolveBinding('Adonis/Core/Server')
    const driver = new MemoryDriver('local', config, router)
    const server = createServer(adonisServer.handle.bind(adonisServer))

    router.post('/', async ({ request }) => {
      await driver.putFile(request.file('file')!, 'foo/bar')
      return request.file('file')
    })

    registerBodyParserMiddleware(app)
    adonisServer.optimize()

    await fs.add('foo.txt', 'hello world')

    const { body } = await supertest(server)
      .post('/')
      .attach('file', join(fs.basePath, 'foo.txt'))
      .expect(200)

    assert.equal(body.state, 'moved')
    assert.match(body.fileName, /foo\/bar\/.*/)
  })
})

test.group('Memory driver | putStream', (group) => {
  group.afterEach(async () => {
    await fs.cleanup()
  })

  test('write stream to a file', async (assert) => {
    const app = await setupApp()
    const router = app.container.resolveBinding('Adonis/Core/Route')
    const config = { driver: 'memory' as const, root: TEST_ROOT, visibility: 'public' as const }

    const driver = new MemoryDriver('local', config, router)
    const stream = new Readable({
      read() {
        this.push('hello world')
        this.push(null)
      },
    })

    assert.isTrue(stream.readable)
    await driver.putStream('foo.txt', stream)
    assert.isFalse(stream.readable)

    const contents = await driver.get('foo.txt')
    assert.equal(contents.toString(), 'hello world')
  })

  test('create intermediate directories when writing a stream to a file', async (assert) => {
    const app = await setupApp()
    const router = app.container.resolveBinding('Adonis/Core/Route')
    const config = { driver: 'memory' as const, root: TEST_ROOT, visibility: 'public' as const }

    const driver = new MemoryDriver('local', config, router)
    const stream = new Readable({
      read() {
        this.push('hello world')
        this.push(null)
      },
    })

    assert.isTrue(stream.readable)
    await driver.putStream('bar/baz/foo.txt', stream)
    assert.isFalse(stream.readable)

    const contents = await driver.get('bar/baz/foo.txt')
    assert.equal(contents.toString(), 'hello world')
  })

  test('overwrite existing file when stream to a file', async (assert) => {
    const app = await setupApp()
    const router = app.container.resolveBinding('Adonis/Core/Route')
    const config = { driver: 'memory' as const, root: TEST_ROOT, visibility: 'public' as const }

    const driver = new MemoryDriver('local', config, router)
    const stream = new Readable({
      read() {
        this.push('hello world')
        this.push(null)
      },
    })

    assert.isTrue(stream.readable)
    await driver.put('foo.txt', 'hi world')
    await driver.putStream('foo.txt', stream)
    assert.isFalse(stream.readable)

    const contents = await driver.get('foo.txt')
    assert.equal(contents.toString(), 'hello world')
  })
})

test.group('Memory driver | exists', (group) => {
  group.afterEach(async () => {
    await fs.cleanup()
  })

  test('return true when a file exists', async (assert) => {
    const app = await setupApp()
    const router = app.container.resolveBinding('Adonis/Core/Route')
    const config = { driver: 'memory' as const, root: TEST_ROOT, visibility: 'public' as const }

    const driver = new MemoryDriver('local', config, router)
    await driver.put('bar/baz/foo.txt', 'bar')
    assert.isTrue(await driver.exists('bar/baz/foo.txt'))
  })

  test("return false when a file doesn't exists", async (assert) => {
    const app = await setupApp()
    const router = app.container.resolveBinding('Adonis/Core/Route')
    const config = { driver: 'memory' as const, root: TEST_ROOT, visibility: 'public' as const }

    const driver = new MemoryDriver('local', config, router)
    assert.isFalse(await driver.exists('foo.txt'))
  })

  test("return false when a file parent directory doesn't exists", async (assert) => {
    const app = await setupApp()
    const router = app.container.resolveBinding('Adonis/Core/Route')
    const config = { driver: 'memory' as const, root: TEST_ROOT, visibility: 'public' as const }

    const driver = new MemoryDriver('local', config, router)
    assert.isFalse(await driver.exists('bar/baz/foo.txt'))
  })
})

test.group('Memory driver | delete', (group) => {
  group.afterEach(async () => {
    await fs.cleanup()
  })

  test('remove file', async (assert) => {
    const app = await setupApp()
    const router = app.container.resolveBinding('Adonis/Core/Route')
    const config = { driver: 'memory' as const, root: TEST_ROOT, visibility: 'public' as const }

    const driver = new MemoryDriver('local', config, router)
    await driver.put('bar/baz/foo.txt', 'bar')
    await driver.delete('bar/baz/foo.txt')

    assert.isFalse(await driver.exists(join(TEST_ROOT, 'bar/baz/foo.txt')))
  })

  test('do not error when trying to remove a non-existing file', async (assert) => {
    const app = await setupApp()
    const router = app.container.resolveBinding('Adonis/Core/Route')
    const config = { driver: 'memory' as const, root: TEST_ROOT, visibility: 'public' as const }

    const driver = new MemoryDriver('local', config, router)

    await driver.delete('foo.txt')
    assert.isFalse(await driver.exists(join(TEST_ROOT, 'foo.txt')))
  })

  test("do not error when file parent directory doesn't exists", async (assert) => {
    const app = await setupApp()
    const router = app.container.resolveBinding('Adonis/Core/Route')
    const config = { driver: 'memory' as const, root: TEST_ROOT, visibility: 'public' as const }

    const driver = new MemoryDriver('local', config, router)

    await driver.delete('bar/baz/foo.txt')
    assert.isFalse(await driver.exists(join(TEST_ROOT, 'bar/baz/foo.txt')))
  })
})

test.group('Memory driver | copy', (group) => {
  group.afterEach(async () => {
    await fs.cleanup()
  })

  test('copy file from within the disk root', async (assert) => {
    const app = await setupApp()
    const router = app.container.resolveBinding('Adonis/Core/Route')
    const config = { driver: 'memory' as const, root: TEST_ROOT, visibility: 'public' as const }

    const driver = new MemoryDriver('local', config, router)
    await driver.put('foo.txt', 'hello world')
    await driver.copy('foo.txt', 'bar.txt')

    const contents = await driver.get('bar.txt')
    assert.equal(contents.toString(), 'hello world')
  })

  test('create intermediate directories when copying a file', async (assert) => {
    const app = await setupApp()
    const router = app.container.resolveBinding('Adonis/Core/Route')
    const config = { driver: 'memory' as const, root: TEST_ROOT, visibility: 'public' as const }

    const driver = new MemoryDriver('local', config, router)
    await driver.put('foo.txt', 'hello world')
    await driver.copy('foo.txt', 'baz/bar.txt')

    const contents = await driver.get('baz/bar.txt')
    assert.equal(contents.toString(), 'hello world')
  })

  test("return error when source doesn't exists", async (assert) => {
    assert.plan(1)

    const app = await setupApp()
    const router = app.container.resolveBinding('Adonis/Core/Route')
    const config = { driver: 'memory' as const, root: TEST_ROOT, visibility: 'public' as const }

    const driver = new MemoryDriver('local', config, router)
    try {
      await driver.copy('foo.txt', 'bar.txt')
    } catch (error) {
      assert.match(error.message, /ENOENT: no such file or directory/)
    }
  })

  test('overwrite destination when already exists', async (assert) => {
    const app = await setupApp()
    const router = app.container.resolveBinding('Adonis/Core/Route')
    const config = { driver: 'memory' as const, root: TEST_ROOT, visibility: 'public' as const }

    const driver = new MemoryDriver('local', config, router)
    await driver.put('foo.txt', 'hello world')
    await driver.put('bar.txt', 'hi world')
    await driver.copy('foo.txt', 'bar.txt')

    const contents = await driver.get('bar.txt')
    assert.equal(contents.toString(), 'hello world')
  })
})

test.group('Memory driver | move', (group) => {
  group.afterEach(async () => {
    await fs.cleanup()
  })

  test('move file from within the disk root', async (assert) => {
    const app = await setupApp()
    const router = app.container.resolveBinding('Adonis/Core/Route')
    const config = { driver: 'memory' as const, root: TEST_ROOT, visibility: 'public' as const }

    const driver = new MemoryDriver('local', config, router)
    await driver.put('foo.txt', 'hello world')
    await driver.move('foo.txt', 'bar.txt')

    const contents = await driver.get('bar.txt')
    assert.equal(contents.toString(), 'hello world')
    assert.isFalse(await driver.exists('foo.txt'))
  })

  test('create intermediate directories when moving a file', async (assert) => {
    const app = await setupApp()
    const router = app.container.resolveBinding('Adonis/Core/Route')
    const config = { driver: 'memory' as const, root: TEST_ROOT, visibility: 'public' as const }

    const driver = new MemoryDriver('local', config, router)
    await driver.put('foo.txt', 'hello world')
    await driver.move('foo.txt', 'baz/bar.txt')

    const contents = await driver.get('baz/bar.txt')
    assert.equal(contents.toString(), 'hello world')
    assert.isFalse(await driver.exists('foo.txt'))
  })

  test("return error when source doesn't exists", async (assert) => {
    assert.plan(1)
    const app = await setupApp()
    const router = app.container.resolveBinding('Adonis/Core/Route')
    const config = { driver: 'memory' as const, root: TEST_ROOT, visibility: 'public' as const }

    const driver = new MemoryDriver('local', config, router)

    try {
      await driver.move('foo.txt', 'baz/bar.txt')
    } catch (error) {
      assert.match(error.message, /ENOENT: no such file or directory/)
    }
  })

  test('overwrite destination when already exists', async (assert) => {
    assert.plan(1)
    const app = await setupApp()
    const router = app.container.resolveBinding('Adonis/Core/Route')
    const config = { driver: 'memory' as const, root: TEST_ROOT, visibility: 'public' as const }

    const driver = new MemoryDriver('local', config, router)

    await driver.put('foo.txt', 'hello world')
    await driver.put('baz/bar.txt', 'hi world')

    await driver.move('foo.txt', 'baz/bar.txt')

    const contents = await driver.get('baz/bar.txt')
    assert.equal(contents.toString(), 'hello world')
  })
})

test.group('Memory driver | get', (group) => {
  group.afterEach(async () => {
    await fs.cleanup()
  })

  test('get file contents', async (assert) => {
    const app = await setupApp()
    const router = app.container.resolveBinding('Adonis/Core/Route')
    const config = { driver: 'memory' as const, root: TEST_ROOT, visibility: 'public' as const }

    const driver = new MemoryDriver('local', config, router)
    await driver.put('foo.txt', 'hello world')

    const contents = await driver.get('foo.txt')
    assert.equal(contents.toString(), 'hello world')
  })

  test('get file contents as a stream', async (assert, done) => {
    assert.plan(1)

    const app = await setupApp()
    const router = app.container.resolveBinding('Adonis/Core/Route')
    const config = { driver: 'memory' as const, root: TEST_ROOT, visibility: 'public' as const }

    const driver = new MemoryDriver('local', config, router)
    await driver.put('foo.txt', 'hello world')

    const stream = await driver.getStream('foo.txt')
    stream.on('data', (chunk) => {
      assert.equal(chunk, 'hello world')
      done()
    })
  })

  test("return error when file doesn't exists", async (assert) => {
    assert.plan(1)
    const app = await setupApp()
    const router = app.container.resolveBinding('Adonis/Core/Route')
    const config = { driver: 'memory' as const, root: TEST_ROOT, visibility: 'public' as const }

    const driver = new MemoryDriver('local', config, router)

    try {
      await driver.get('foo.txt')
    } catch (error) {
      assert.match(error.message, /ENOENT: no such file or directory/)
    }
  })
})

test.group('Memory driver | getStats', (group) => {
  group.afterEach(async () => {
    await fs.cleanup()
  })

  test('get file stats', async (assert) => {
    const app = await setupApp()
    const router = app.container.resolveBinding('Adonis/Core/Route')
    const config = { driver: 'memory' as const, root: TEST_ROOT, visibility: 'public' as const }

    const driver = new MemoryDriver('local', config, router)
    await driver.put('foo.txt', 'hello world')

    const stats = await driver.getStats('foo.txt')
    assert.equal(stats.size, 11)
    assert.instanceOf(stats.modified, Date)
  })

  test('return error when file is missing', async (assert) => {
    assert.plan(1)
    const app = await setupApp()
    const router = app.container.resolveBinding('Adonis/Core/Route')
    const config = { driver: 'memory' as const, root: TEST_ROOT, visibility: 'public' as const }

    const driver = new MemoryDriver('local', config, router)

    try {
      await driver.getStats('foo.txt')
    } catch (error) {
      assert.match(error.message, /ENOENT: no such file or directory/)
    }
  })
})

test.group('Memory driver | getUrl', (group) => {
  group.afterEach(async () => {
    await fs.cleanup()
  })

  test('get url to a given file', async (assert) => {
    const app = await setupApp()
    const router = app.container.resolveBinding('Adonis/Core/Route')

    const config = {
      driver: 'memory' as const,
      root: TEST_ROOT,
      visibility: 'public' as const,
      serveAssets: true,
      basePath: '/uploads',
    }

    const driver = new MemoryDriver('local', config, router)
    new LocalFileServer('local', config, driver, router).registerRoute()
    router.commit()

    const url = await driver.getUrl('foo.txt')
    assert.equal(url, '/uploads/foo.txt')
  })

  test('serve file from the url', async (assert) => {
    const app = await setupApp()
    const router = app.container.resolveBinding('Adonis/Core/Route')
    const adonisServer = app.container.resolveBinding('Adonis/Core/Server')

    const config = {
      driver: 'memory' as const,
      root: TEST_ROOT,
      visibility: 'public' as const,
      serveAssets: true,
      basePath: '/uploads',
    }

    const driver = new MemoryDriver('local', config, router)
    new LocalFileServer('local', config, driver, router).registerRoute()
    adonisServer.optimize()

    const server = createServer(adonisServer.handle.bind(adonisServer))
    await driver.put('foo.txt', 'hello world')

    const { text, headers } = await supertest(server)
      .get(await driver.getUrl('foo.txt'))
      .expect(200)

    assert.equal(text, 'hello world')
    assert.equal(headers['content-length'], 'hello world'.length)
    assert.equal(headers['content-type'], 'text/plain; charset=utf-8')
  })

  test('generate etag for public files', async (assert) => {
    const app = await setupApp()
    const router = app.container.resolveBinding('Adonis/Core/Route')
    const adonisServer = app.container.resolveBinding('Adonis/Core/Server')

    const config = {
      driver: 'memory' as const,
      root: TEST_ROOT,
      visibility: 'public' as const,
      serveAssets: true,
      basePath: '/uploads',
    }

    const driver = new MemoryDriver('local', config, router)
    new LocalFileServer('local', config, driver, router).registerRoute()
    adonisServer.optimize()

    const server = createServer(adonisServer.handle.bind(adonisServer))
    await driver.put('foo.txt', 'hello world')

    const { text, headers } = await supertest(server)
      .get(await driver.getUrl('foo.txt'))
      .expect(200)

    assert.equal(text, 'hello world')
    assert.property(headers, 'etag')
  })

  test('do not serve file when cache is fresh', async (assert) => {
    const app = await setupApp()
    const router = app.container.resolveBinding('Adonis/Core/Route')
    const adonisServer = app.container.resolveBinding('Adonis/Core/Server')

    const config = {
      driver: 'memory' as const,
      root: TEST_ROOT,
      visibility: 'public' as const,
      serveAssets: true,
      basePath: '/uploads',
    }

    const driver = new MemoryDriver('local', config, router)
    new LocalFileServer('local', config, driver, router).registerRoute()
    adonisServer.optimize()

    const server = createServer(adonisServer.handle.bind(adonisServer))
    await driver.put('foo.txt', 'hello world')
    const fileEtag = etag(
      await promisify(driver.adapter.stat.bind(driver.adapter))(driver.makePath('foo.txt'))
    )

    const { text, headers } = await supertest(server)
      .get(await driver.getUrl('foo.txt'))
      .set('if-none-match', fileEtag)
      .expect(304)

    assert.equal(text, '')
    assert.equal(headers['etag'], fileEtag)
  })

  test('deny access when attempting to access a private file', async (assert) => {
    const app = await setupApp()
    const router = app.container.resolveBinding('Adonis/Core/Route')
    const adonisServer = app.container.resolveBinding('Adonis/Core/Server')

    const config = {
      driver: 'memory' as const,
      root: TEST_ROOT,
      visibility: 'private' as const,
      serveAssets: true,
      basePath: '/uploads',
    }

    const driver = new MemoryDriver('local', config, router)
    new LocalFileServer('local', config, driver, router).registerRoute()
    adonisServer.optimize()

    const server = createServer(adonisServer.handle.bind(adonisServer))
    await driver.put('foo.txt', 'hello world')

    const { text } = await supertest(server)
      .get(await driver.getUrl('foo.txt'))
      .expect(401)

    assert.equal(text, 'Access denied')
  })
})

test.group('Memory driver | getSignedUrl', (group) => {
  group.afterEach(async () => {
    await fs.cleanup()
  })

  test('get signed url to a given file', async (assert) => {
    const app = await setupApp()
    const router = app.container.resolveBinding('Adonis/Core/Route')

    const config = {
      driver: 'memory' as const,
      root: TEST_ROOT,
      visibility: 'private' as const,
      serveAssets: true,
      basePath: '/uploads',
    }

    const driver = new MemoryDriver('local', config, router)
    new LocalFileServer('local', config, driver, router).registerRoute()
    router.commit()

    const url = await driver.getSignedUrl('foo.txt')
    assert.match(url, /\/uploads\/foo\.txt\?signature=.*/)
  })

  test('serve file from the signed url', async (assert) => {
    const app = await setupApp()
    const router = app.container.resolveBinding('Adonis/Core/Route')
    const adonisServer = app.container.resolveBinding('Adonis/Core/Server')

    const config = {
      driver: 'memory' as const,
      root: TEST_ROOT,
      visibility: 'private' as const,
      serveAssets: true,
      basePath: '/uploads',
    }

    const driver = new MemoryDriver('local', config, router)
    new LocalFileServer('local', config, driver, router).registerRoute()
    adonisServer.optimize()

    const server = createServer(adonisServer.handle.bind(adonisServer))
    await driver.put('foo.txt', 'hello world')

    const { text, headers } = await supertest(server)
      .get(await driver.getSignedUrl('foo.txt'))
      .expect(200)

    assert.equal(text, 'hello world')
    assert.equal(headers['content-length'], 'hello world'.length)
    assert.equal(headers['content-type'], 'text/plain; charset=utf-8')
  })

  test('generate etag for private files', async (assert) => {
    const app = await setupApp()
    const router = app.container.resolveBinding('Adonis/Core/Route')
    const adonisServer = app.container.resolveBinding('Adonis/Core/Server')

    const config = {
      driver: 'memory' as const,
      root: TEST_ROOT,
      visibility: 'private' as const,
      serveAssets: true,
      basePath: '/uploads',
    }

    const driver = new MemoryDriver('local', config, router)
    new LocalFileServer('local', config, driver, router).registerRoute()
    adonisServer.optimize()

    const server = createServer(adonisServer.handle.bind(adonisServer))
    await driver.put('foo.txt', 'hello world')

    const { text, headers } = await supertest(server)
      .get(await driver.getSignedUrl('foo.txt'))
      .expect(200)

    assert.equal(text, 'hello world')
    assert.property(headers, 'etag')
  })

  test('serve public files from the signed url', async (assert) => {
    const app = await setupApp()
    const router = app.container.resolveBinding('Adonis/Core/Route')
    const adonisServer = app.container.resolveBinding('Adonis/Core/Server')

    const config = {
      driver: 'memory' as const,
      root: TEST_ROOT,
      visibility: 'public' as const,
      serveAssets: true,
      basePath: '/uploads',
    }

    const driver = new MemoryDriver('local', config, router)
    new LocalFileServer('local', config, driver, router).registerRoute()
    adonisServer.optimize()

    const server = createServer(adonisServer.handle.bind(adonisServer))
    await driver.put('foo.txt', 'hello world')

    const { text, headers } = await supertest(server)
      .get(await driver.getSignedUrl('foo.txt'))
      .expect(200)

    assert.equal(text, 'hello world')
    assert.property(headers, 'etag')
  })
})
