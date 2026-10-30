/* The simmerspace community in Inspiration: posts (with tags, editing and comments), personal boards and following
   other simlings. Everything goes through Supabase with the signed-in player's session, so row-level security
   decides what each person can read and change (supabase/migrations/20261031000000_inspiration_social.sql).
   Until that migration is applied the feed keeps working as in 0.12.0: the social parts report `social: false`
   and their actions fail with COMMUNITY_NOT_READY instead of breaking the page. */
const crypto = require('node:crypto');
const { AppError } = require('./errors.cjs');

const POST_BUCKET = 'inspiration';
const POST_CATEGORIES = ['cas', 'build', 'gameplay', 'story', 'other'];
const POST_TYPES = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif' };
const POST_MAX_BYTES = 10 * 1024 * 1024;
const PAGE_SIZE = 24;
const SIGNED_URL_SECONDS = 60 * 60;
const MAX_TAGS = 8;
const TAG_MIN = 2;
const TAG_MAX = 32;
const COMMENT_MAX = 1000;
const COMMENTS_PER_POST = 200;
const BOARD_NAME_MAX = 60;
const BOARD_DESCRIPTION_MAX = 300;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// PostgREST answers with these when a table or function from the 0.12.1 migration does not exist yet.
const MISSING = new Set(['42P01', '42883', 'PGRST202', 'PGRST205', 'PGRST200']);

// The search form of a tag, the same as simmerspace_tag_slug() in the migration: lowercase, no accents,
// words joined by "-". "Long Curly Hair" -> "long-curly-hair".
function tagSlug(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
// Cleans the tags typed by the player: readable names, one per slug, 2–32 characters, at most 8.
function cleanTags(values) {
  if (values === undefined || values === null) return [];
  if (!Array.isArray(values)) throw new AppError('INVALID_INPUT', 'Tags must be a list.');
  const seen = new Set();
  const tags = [];
  for (const raw of values) {
    const name = String(raw ?? '').replace(/\s+/g, ' ').trim().replace(/^#+/, '').trim();
    const slug = tagSlug(name);
    if (slug.length < TAG_MIN || name.length < TAG_MIN || seen.has(slug)) continue;
    if (name.length > TAG_MAX || slug.length > TAG_MAX) throw new AppError('TAG_TOO_LONG', 'A tag is too long.', { max: TAG_MAX });
    seen.add(slug);
    tags.push(name);
  }
  if (tags.length > MAX_TAGS) throw new AppError('TOO_MANY_TAGS', 'A post can have at most 8 tags.', { max: MAX_TAGS });
  return tags;
}
function checkId(value, what = 'id') {
  if (typeof value !== 'string' || !UUID.test(value)) throw new AppError('INVALID_INPUT', `A valid ${what} was expected.`);
  return value;
}
function cleanText(value, max) {
  return typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim().slice(0, max) : '';
}
function isMissing(error) {
  return !!error && (MISSING.has(String(error.code)) || /does not exist|could not find the (table|function)/i.test(error.message || ''));
}
function notReady() {
  return new AppError('COMMUNITY_NOT_READY', 'The community features are not set up on the server yet.');
}

function createCommunityService({ run, requireUser, avatarUrl }) {
  // Lets every call know quickly whether the migration is there; checked again after a failure.
  let socialReady = null;

  async function social(sb) {
    if (socialReady !== null) return socialReady;
    const probe = await sb.from('inspiration_tags').select('id', { head: true, count: 'exact' }).limit(1);
    socialReady = !isMissing(probe.error);
    return socialReady;
  }
  async function needSocial(sb) {
    if (!(await social(sb))) throw notReady();
  }
  function socialFailure(error) {
    if (isMissing(error)) {
      socialReady = false;
      return notReady();
    }
    return error;
  }

  async function signedUrls(sb, paths) {
    if (!paths.length) return new Map();
    const { data, error } = await sb.storage.from(POST_BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS);
    if (error) throw error;
    return new Map((data || []).filter(item => item.signedUrl && !item.error).map(item => [item.path, item.signedUrl]));
  }

  async function authorsById(sb, ids) {
    if (!ids.length) return new Map();
    const { data, error } = await sb.from('profiles').select('id, username, avatar_url').in('id', ids);
    if (error) throw error;
    return new Map((data || []).map(row => [row.id, { username: row.username || '', avatarUrl: avatarUrl(sb, row.avatar_url) }]));
  }

  // Tags and comment counts for a page of posts, in two small queries (never the whole table).
  async function socialDetails(sb, postIds) {
    const empty = { tags: new Map(), comments: new Map() };
    if (!postIds.length || !(await social(sb))) return empty;
    const [tagRows, commentRows] = await Promise.all([
      sb.from('inspiration_post_tags').select('post_id, inspiration_tags(id, slug, name)').in('post_id', postIds),
      sb.from('inspiration_comments').select('post_id').in('post_id', postIds).is('deleted_at', null)
    ]);
    if (tagRows.error || commentRows.error) {
      if (isMissing(tagRows.error) || isMissing(commentRows.error)) socialReady = false;
      return empty;
    }
    const tags = new Map();
    for (const row of tagRows.data || []) {
      const tag = row.inspiration_tags;
      if (!tag) continue;
      if (!tags.has(row.post_id)) tags.set(row.post_id, []);
      tags.get(row.post_id).push({ slug: tag.slug, name: tag.name });
    }
    for (const list of tags.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    const comments = new Map();
    for (const row of commentRows.data || []) comments.set(row.post_id, (comments.get(row.post_id) || 0) + 1);
    return { tags, comments };
  }

  async function decoratePosts(sb, rows, me) {
    const [authors, urls, details] = await Promise.all([
      authorsById(sb, [...new Set(rows.map(row => row.user_id))]),
      signedUrls(sb, rows.map(row => row.image_path)),
      socialDetails(sb, rows.map(row => row.id))
    ]);
    return rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      author: authors.get(row.user_id) || { username: '', avatarUrl: '' },
      imageUrl: urls.get(row.image_path) || '',
      caption: row.caption || '',
      category: POST_CATEGORIES.includes(row.category) ? row.category : 'other',
      createdAt: row.created_at,
      updatedAt: row.updated_at || null,
      tags: details.tags.get(row.id) || [],
      commentCount: details.comments.get(row.id) || 0,
      own: row.user_id === me.id
    }));
  }

  async function followeeIds(sb, userId) {
    const { data, error } = await sb.from('user_follows').select('followee_id').eq('follower_id', userId).limit(1000);
    if (error) throw socialFailure(error);
    return (data || []).map(row => row.followee_id);
  }

  /* ---------- Posts ---------- */
  // One page of the feed, newest first. Filters: category, one person (userId), the simlings the player follows
  // (following: true) and tags (all of them must match). `before` is the created_at of the last post shown.
  async function listPosts({ before, category, userId, limit, tags, following } = {}) {
    const size = Number.isInteger(limit) && limit > 0 && limit <= 48 ? limit : PAGE_SIZE;
    const slugs = Array.isArray(tags) ? [...new Set(tags.map(tagSlug).filter(slug => slug.length >= TAG_MIN))].slice(0, MAX_TAGS) : [];
    const beforeTime = typeof before === 'string' && !Number.isNaN(Date.parse(before)) ? before : null;
    const cat = POST_CATEGORIES.includes(category) ? category : null;
    return run(async sb => {
      const me = await requireUser(sb);
      let data;
      if (slugs.length) {
        await needSocial(sb);
        const result = await sb.rpc('inspiration_posts_tagged', { tag_slugs: slugs, post_category: cat, before_time: beforeTime, max_rows: size + 1 });
        if (result.error) throw socialFailure(result.error);
        data = result.data || [];
        if (typeof userId === 'string' && UUID.test(userId)) data = data.filter(row => row.user_id === userId);
      } else {
        let query = sb.from('inspiration_posts').select('*').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(size + 1);
        if (cat) query = query.eq('category', cat);
        if (typeof userId === 'string' && UUID.test(userId)) query = query.eq('user_id', userId);
        if (following) {
          await needSocial(sb);
          const ids = await followeeIds(sb, me.id);
          if (!ids.length) return { posts: [], nextBefore: null, social: true };
          query = query.in('user_id', ids);
        }
        if (beforeTime) query = query.lt('created_at', beforeTime);
        const result = await query;
        if (result.error) throw result.error;
        data = result.data || [];
      }
      const rows = data.slice(0, size);
      return { posts: await decoratePosts(sb, rows, me), nextBefore: data.length > size ? rows.at(-1).created_at : null, social: await social(sb) };
    });
  }

  async function getPost({ id } = {}) {
    checkId(id, 'post id');
    return run(async sb => {
      const me = await requireUser(sb);
      const { data, error } = await sb.from('inspiration_posts').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!data) throw new AppError('COMMUNITY_GONE', 'This post is no longer available.');
      return { post: (await decoratePosts(sb, [data], me))[0] };
    });
  }

  async function setTags(sb, postId, tags) {
    const result = await sb.rpc('set_post_tags', { target_post: postId, tag_names: tags });
    if (result.error) throw socialFailure(result.error);
    return (result.data || []).map(tag => ({ slug: tag.slug, name: tag.name }));
  }

  // Images go to inspiration/<user id>/<random id>.<ext>. If saving the post fails, the image is removed again.
  async function createPost(input = {}) {
    const data = input?.data;
    if (!ArrayBuffer.isView(data) || !data.byteLength) throw new AppError('INVALID_INPUT', 'An image was expected.');
    const ext = POST_TYPES[input.type];
    if (!ext) throw new AppError('IMAGE_TYPE', 'This image type is not supported.');
    if (data.byteLength > POST_MAX_BYTES) throw new AppError('IMAGE_TOO_LARGE', 'The image is too large.', { maxBytes: POST_MAX_BYTES });
    const caption = cleanText(input.caption, 500);
    const category = POST_CATEGORIES.includes(input.category) ? input.category : 'other';
    const tags = cleanTags(input.tags);
    return run(async sb => {
      const user = await requireUser(sb);
      const objectPath = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const bucket = sb.storage.from(POST_BUCKET);
      const uploaded = await bucket.upload(objectPath, Buffer.from(data.buffer, data.byteOffset, data.byteLength), { contentType: input.type, upsert: false, cacheControl: '86400' });
      if (uploaded.error) throw uploaded.error;
      const saved = await sb.from('inspiration_posts').insert({ user_id: user.id, image_path: objectPath, caption, category }).select('id').single();
      if (saved.error) {
        await bucket.remove([objectPath]);
        throw saved.error;
      }
      // The post exists either way; if the tags could not be saved the player can add them by editing it.
      let tagsSaved = true;
      if (tags.length) {
        try {
          if (!(await social(sb))) throw notReady();
          await setTags(sb, saved.data.id, tags);
        } catch {
          tagsSaved = false;
        }
      }
      return { id: saved.data.id, tagsSaved };
    });
  }

  // Caption, category and tags of one of the player's own posts. The publication date never changes.
  async function updatePost({ id, caption, category, tags } = {}) {
    checkId(id, 'post id');
    const changes = {};
    if (caption !== undefined) changes.caption = cleanText(caption, 500);
    if (category !== undefined) {
      if (!POST_CATEGORIES.includes(category)) throw new AppError('INVALID_INPUT', 'Unknown category.');
      changes.category = category;
    }
    const newTags = tags === undefined ? null : cleanTags(tags);
    return run(async sb => {
      const me = await requireUser(sb);
      const found = await sb.from('inspiration_posts').select('id').eq('id', id).eq('user_id', me.id).maybeSingle();
      if (found.error) throw found.error;
      if (!found.data) throw new AppError('ACCOUNT_FORBIDDEN', 'Only the author can edit this post.');
      if (Object.keys(changes).length) {
        const saved = await sb.from('inspiration_posts').update(changes).eq('id', id).eq('user_id', me.id);
        if (saved.error) throw saved.error;
      }
      if (newTags) {
        await needSocial(sb);
        await setTags(sb, id, newTags);
      }
      const { data, error } = await sb.from('inspiration_posts').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return { post: (await decoratePosts(sb, [data], me))[0] };
    });
  }

  // Deletes the post and its image. Row-level security only lets the author do this. Its tags, comments and
  // board entries go with it (foreign keys), so no board ever shows a missing post.
  async function deletePost({ id } = {}) {
    if (typeof id !== 'string' && !Number.isInteger(id)) throw new AppError('INVALID_INPUT', 'A post id was expected.');
    return run(async sb => {
      const user = await requireUser(sb);
      const found = await sb.from('inspiration_posts').select('id, image_path').eq('id', id).eq('user_id', user.id).maybeSingle();
      if (found.error) throw found.error;
      if (!found.data) throw new AppError('ACCOUNT_FORBIDDEN', 'Only the author can delete this post.');
      const removed = await sb.from('inspiration_posts').delete().eq('id', id).eq('user_id', user.id);
      if (removed.error) throw removed.error;
      const image = await sb.storage.from(POST_BUCKET).remove([found.data.image_path]);
      return { deleted: true, imageRemoved: !image.error };
    });
  }

  async function suggestTags({ prefix = '', limit = 8 } = {}) {
    return run(async sb => {
      await requireUser(sb);
      if (!(await social(sb))) return { tags: [] };
      const result = await sb.rpc('suggest_inspiration_tags', { prefix: String(prefix).slice(0, TAG_MAX), max_rows: Math.min(20, Math.max(1, Number(limit) || 8)) });
      if (result.error) throw socialFailure(result.error);
      return { tags: (result.data || []).map(tag => ({ slug: tag.slug, name: tag.name, uses: Number(tag.uses) || 0 })) };
    });
  }

  /* ---------- Profiles and following ---------- */
  async function getProfile({ userId } = {}) {
    checkId(userId, 'profile id');
    return run(async sb => {
      const me = await requireUser(sb);
      const [profile, posts] = await Promise.all([
        sb.from('profiles').select('id, username, avatar_url, created_at').eq('id', userId).maybeSingle(),
        sb.from('inspiration_posts').select('id', { count: 'exact', head: true }).eq('user_id', userId)
      ]);
      if (profile.error) throw profile.error;
      if (!profile.data) throw new AppError('COMMUNITY_GONE', 'This profile does not exist.');
      const result = {
        id: profile.data.id,
        username: profile.data.username || '',
        avatarUrl: avatarUrl(sb, profile.data.avatar_url),
        createdAt: profile.data.created_at,
        postCount: posts.count || 0,
        own: profile.data.id === me.id,
        social: await social(sb),
        followers: null,
        following: null,
        iFollow: false
      };
      if (result.social) {
        const [followers, following, mine] = await Promise.all([
          sb.from('user_follows').select('follower_id', { count: 'exact', head: true }).eq('followee_id', userId),
          sb.from('user_follows').select('followee_id', { count: 'exact', head: true }).eq('follower_id', userId),
          sb.from('user_follows').select('followee_id').eq('follower_id', me.id).eq('followee_id', userId).maybeSingle()
        ]);
        if (!followers.error && !following.error) Object.assign(result, { followers: followers.count || 0, following: following.count || 0, iFollow: !!mine.data });
      }
      return result;
    });
  }

  async function follow({ userId } = {}) {
    checkId(userId, 'profile id');
    return run(async sb => {
      const me = await requireUser(sb);
      if (userId === me.id) throw new AppError('INVALID_INPUT', 'You cannot follow yourself.');
      await needSocial(sb);
      const saved = await sb.from('user_follows').insert({ follower_id: me.id, followee_id: userId });
      // Following someone already followed is not an error: the result is the same.
      if (saved.error && String(saved.error.code) !== '23505') throw socialFailure(saved.error.code === '23503' ? new AppError('COMMUNITY_GONE', 'This profile does not exist.') : saved.error);
      return { following: true };
    });
  }

  async function unfollow({ userId } = {}) {
    checkId(userId, 'profile id');
    return run(async sb => {
      const me = await requireUser(sb);
      await needSocial(sb);
      const removed = await sb.from('user_follows').delete().eq('follower_id', me.id).eq('followee_id', userId);
      if (removed.error) throw socialFailure(removed.error);
      return { following: false };
    });
  }

  // The followers or the followed accounts of one simling, newest first, a page at a time.
  async function listFollows({ userId, kind = 'followers', offset = 0, limit = 50 } = {}) {
    checkId(userId, 'profile id');
    const followers = kind !== 'following';
    const size = Math.min(100, Math.max(1, Number(limit) || 50));
    const start = Math.max(0, Number(offset) || 0);
    return run(async sb => {
      const me = await requireUser(sb);
      await needSocial(sb);
      const own = followers ? 'followee_id' : 'follower_id';
      const other = followers ? 'follower_id' : 'followee_id';
      const { data, error } = await sb.from('user_follows').select(`${other}, created_at`).eq(own, userId).order('created_at', { ascending: false }).range(start, start + size);
      if (error) throw socialFailure(error);
      const rows = (data || []).slice(0, size);
      const ids = rows.map(row => row[other]);
      const [people, mine] = await Promise.all([authorsById(sb, ids), ids.length ? sb.from('user_follows').select('followee_id').eq('follower_id', me.id).in('followee_id', ids) : Promise.resolve({ data: [] })]);
      const followed = new Set((mine.data || []).map(row => row.followee_id));
      return {
        people: ids.map(id => ({ id, ...(people.get(id) || { username: '', avatarUrl: '' }), iFollow: followed.has(id), isMe: id === me.id })),
        nextOffset: (data || []).length > size ? start + size : null
      };
    });
  }

  /* ---------- Boards ---------- */
  function cleanBoard({ name, description } = {}, { partial = false } = {}) {
    const result = {};
    if (!partial || name !== undefined) {
      const clean = cleanText(name, BOARD_NAME_MAX + 1).replace(/\s+/g, ' ');
      if (!clean) throw new AppError('BOARD_NAME_REQUIRED', 'Give the board a name.');
      if (clean.length > BOARD_NAME_MAX) throw new AppError('INVALID_INPUT', 'The board name is too long.');
      result.name = clean;
    }
    if (!partial || description !== undefined) result.description = cleanText(description, BOARD_DESCRIPTION_MAX) || null;
    return result;
  }
  function boardError(error) {
    if (String(error?.code) === '23505') return new AppError('BOARD_NAME_TAKEN', 'You already have a board with this name.');
    return socialFailure(error);
  }

  // The player's own boards with how many posts each has and a few images for its cover.
  async function listBoards({ postId } = {}) {
    return run(async sb => {
      const me = await requireUser(sb);
      if (!(await social(sb))) return { boards: [], social: false };
      const { data, error } = await sb.from('inspiration_boards').select('id, name, description, is_public, created_at, updated_at').eq('user_id', me.id).order('created_at', { ascending: false });
      if (error) throw socialFailure(error);
      const boards = data || [];
      const ids = boards.map(board => board.id);
      const saved = ids.length ? await sb.from('inspiration_board_posts').select('board_id, post_id, created_at, inspiration_posts(image_path)').in('board_id', ids).order('created_at', { ascending: false }).limit(2000) : { data: [] };
      if (saved.error) throw socialFailure(saved.error);
      const byBoard = new Map(ids.map(id => [id, []]));
      for (const row of saved.data || []) byBoard.get(row.board_id)?.push(row);
      const coverPaths = [...new Set([...byBoard.values()].flatMap(rows => rows.slice(0, 3).map(row => row.inspiration_posts?.image_path).filter(Boolean)))];
      const urls = await signedUrls(sb, coverPaths);
      return {
        social: true,
        boards: boards.map(board => {
          const rows = byBoard.get(board.id) || [];
          return {
            id: board.id,
            name: board.name,
            description: board.description || '',
            isPublic: board.is_public === true,
            createdAt: board.created_at,
            count: rows.length,
            covers: rows.slice(0, 3).map(row => urls.get(row.inspiration_posts?.image_path)).filter(Boolean),
            hasPost: postId ? rows.some(row => row.post_id === postId) : false
          };
        })
      };
    });
  }

  async function createBoard(input = {}) {
    const values = cleanBoard(input);
    return run(async sb => {
      const me = await requireUser(sb);
      await needSocial(sb);
      const { data, error } = await sb.from('inspiration_boards').insert({ user_id: me.id, ...values, is_public: false }).select('id').single();
      if (error) throw boardError(error);
      return { id: data.id };
    });
  }

  async function updateBoard({ id, ...input } = {}) {
    checkId(id, 'board id');
    const values = cleanBoard(input, { partial: true });
    return run(async sb => {
      const me = await requireUser(sb);
      await needSocial(sb);
      const { data, error } = await sb.from('inspiration_boards').update(values).eq('id', id).eq('user_id', me.id).select('id');
      if (error) throw boardError(error);
      if (!data?.length) throw new AppError('ACCOUNT_FORBIDDEN', 'Only the owner can change this board.');
      return { updated: true };
    });
  }

  async function deleteBoard({ id } = {}) {
    checkId(id, 'board id');
    return run(async sb => {
      const me = await requireUser(sb);
      await needSocial(sb);
      const { data, error } = await sb.from('inspiration_boards').delete().eq('id', id).eq('user_id', me.id).select('id');
      if (error) throw socialFailure(error);
      if (!data?.length) throw new AppError('ACCOUNT_FORBIDDEN', 'Only the owner can delete this board.');
      return { deleted: true };
    });
  }

  async function boardPosts({ id, before } = {}) {
    checkId(id, 'board id');
    return run(async sb => {
      const me = await requireUser(sb);
      await needSocial(sb);
      const board = await sb.from('inspiration_boards').select('id, name, description, is_public, user_id').eq('id', id).maybeSingle();
      if (board.error) throw socialFailure(board.error);
      if (!board.data) throw new AppError('COMMUNITY_GONE', 'This board does not exist.');
      let query = sb.from('inspiration_board_posts').select('created_at, inspiration_posts(*)').eq('board_id', id).order('created_at', { ascending: false }).limit(PAGE_SIZE + 1);
      if (typeof before === 'string' && !Number.isNaN(Date.parse(before))) query = query.lt('created_at', before);
      const { data, error } = await query;
      if (error) throw socialFailure(error);
      const rows = (data || []).slice(0, PAGE_SIZE);
      const posts = rows.map(row => row.inspiration_posts).filter(Boolean);
      return {
        board: { id: board.data.id, name: board.data.name, description: board.data.description || '', isPublic: board.data.is_public === true, own: board.data.user_id === me.id },
        posts: await decoratePosts(sb, posts, me),
        nextBefore: (data || []).length > PAGE_SIZE ? rows.at(-1).created_at : null
      };
    });
  }

  async function savePost({ boardId, postId } = {}) {
    checkId(boardId, 'board id');
    checkId(postId, 'post id');
    return run(async sb => {
      await requireUser(sb);
      await needSocial(sb);
      const { error } = await sb.from('inspiration_board_posts').insert({ board_id: boardId, post_id: postId });
      if (error && String(error.code) !== '23505') throw String(error.code) === '23503' ? new AppError('COMMUNITY_GONE', 'This post is no longer available.') : socialFailure(error);
      return { saved: true };
    });
  }

  async function unsavePost({ boardId, postId } = {}) {
    checkId(boardId, 'board id');
    checkId(postId, 'post id');
    return run(async sb => {
      await requireUser(sb);
      await needSocial(sb);
      const { error } = await sb.from('inspiration_board_posts').delete().eq('board_id', boardId).eq('post_id', postId);
      if (error) throw socialFailure(error);
      return { saved: false };
    });
  }

  /* ---------- Comments ---------- */
  // All comments of one post (up to 200), oldest first, with their authors. Replies carry parentId.
  async function listComments({ postId } = {}) {
    checkId(postId, 'post id');
    return run(async sb => {
      const me = await requireUser(sb);
      if (!(await social(sb))) return { comments: [], social: false };
      const { data, error } = await sb.from('inspiration_comments').select('id, post_id, user_id, parent_id, body, created_at, edited_at, deleted_at').eq('post_id', postId).order('created_at', { ascending: true }).limit(COMMENTS_PER_POST);
      if (error) throw socialFailure(error);
      const rows = data || [];
      const authors = await authorsById(sb, [...new Set(rows.map(row => row.user_id))]);
      return {
        social: true,
        comments: rows.map(row => ({
          id: row.id,
          postId: row.post_id,
          parentId: row.parent_id || null,
          userId: row.user_id,
          author: authors.get(row.user_id) || { username: '', avatarUrl: '' },
          body: row.deleted_at ? '' : row.body,
          createdAt: row.created_at,
          editedAt: row.edited_at || null,
          deleted: !!row.deleted_at,
          own: row.user_id === me.id
        }))
      };
    });
  }

  function cleanComment(body) {
    const text = cleanText(body, COMMENT_MAX + 1);
    if (!text) throw new AppError('COMMENT_EMPTY', 'Write a comment first.');
    if (text.length > COMMENT_MAX) throw new AppError('COMMENT_TOO_LONG', 'The comment is too long.', { max: COMMENT_MAX });
    return text;
  }

  async function addComment({ postId, parentId, body } = {}) {
    checkId(postId, 'post id');
    if (parentId !== undefined && parentId !== null) checkId(parentId, 'comment id');
    const text = cleanComment(body);
    return run(async sb => {
      const me = await requireUser(sb);
      await needSocial(sb);
      const { data, error } = await sb.from('inspiration_comments').insert({ post_id: postId, user_id: me.id, parent_id: parentId || null, body: text }).select('id').single();
      if (error) throw String(error.code) === '23503' ? new AppError('COMMUNITY_GONE', 'This post is no longer available.') : socialFailure(error);
      return { id: data.id };
    });
  }

  async function editComment({ id, body } = {}) {
    checkId(id, 'comment id');
    const text = cleanComment(body);
    return run(async sb => {
      const me = await requireUser(sb);
      await needSocial(sb);
      const { data, error } = await sb.from('inspiration_comments').update({ body: text }).eq('id', id).eq('user_id', me.id).is('deleted_at', null).select('id');
      if (error) throw socialFailure(error);
      if (!data?.length) throw new AppError('ACCOUNT_FORBIDDEN', 'Only the author can edit this comment.');
      return { edited: true };
    });
  }

  async function deleteComment({ id } = {}) {
    checkId(id, 'comment id');
    return run(async sb => {
      await requireUser(sb);
      await needSocial(sb);
      const { data, error } = await sb.rpc('delete_inspiration_comment', { target_comment: id });
      if (error) throw socialFailure(error);
      return { result: data === 'hidden' ? 'hidden' : 'removed' };
    });
  }

  return {
    listPosts,
    getPost,
    createPost,
    updatePost,
    deletePost,
    suggestTags,
    getProfile,
    follow,
    unfollow,
    listFollows,
    listBoards,
    createBoard,
    updateBoard,
    deleteBoard,
    boardPosts,
    savePost,
    unsavePost,
    listComments,
    addComment,
    editComment,
    deleteComment,
    resetSocialCheck: () => {
      socialReady = null;
    }
  };
}

module.exports = { createCommunityService, tagSlug, cleanTags, POST_CATEGORIES, MAX_TAGS, TAG_MAX, COMMENT_MAX };
