/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from 'vs/base/common/uri';
import { IUserDataProfile, toUserDataProfile } from 'vs/platform/userDataProfile/common/userDataProfile';
import { merge } from 'vs/platform/userDataSync/common/userDataProfilesManifestMerge';
import { ISyncUserDataProfile } from 'vs/platform/userDataSync/common/userDataSync';

suite('UserDataProfilesManifestMerge', () => {

	test('merge returns local profiles if remote does not exist', () => {
		const localProfiles: IUserDataProfile[] = [
			toUserDataProfile('1', '1', URI.file('1')),
			toUserDataProfile('2', '2', URI.file('2')),
		];

		const actual = merge(localProfiles, null, null, []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, []);
		assert.deepStrictEqual(actual.remote?.added, localProfiles);
		assert.deepStrictEqual(actual.remote?.updated, []);
		assert.deepStrictEqual(actual.remote?.removed, []);
	});

	test('merge returns local profiles if remote does not exist with ignored profiles', () => {
		const localProfiles: IUserDataProfile[] = [
			toUserDataProfile('1', '1', URI.file('1')),
			toUserDataProfile('2', '2', URI.file('2')),
		];

		const actual = merge(localProfiles, null, null, ['2']);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, []);
		assert.deepStrictEqual(actual.remote?.added, [localProfiles[0]]);
		assert.deepStrictEqual(actual.remote?.updated, []);
		assert.deepStrictEqual(actual.remote?.removed, []);
	});

	test('merge local and remote profiles when there is no base', () => {
		const localProfiles: IUserDataProfile[] = [
			toUserDataProfile('1', '1', URI.file('1')),
			toUserDataProfile('2', '2', URI.file('2')),
		];
		const remoteProfiles: ISyncUserDataProfile[] = [
			{ id: '1', name: 'changed', collection: '1' },
			{ id: '3', name: '3', collection: '3' },
		];

		const actual = merge(localProfiles, remoteProfiles, null, []);

		assert.deepStrictEqual(actual.local.added, [remoteProfiles[1]]);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, [remoteProfiles[0]]);
		assert.deepStrictEqual(actual.remote?.added, [localProfiles[1]]);
		assert.deepStrictEqual(actual.remote?.updated, []);
		assert.deepStrictEqual(actual.remote?.removed, []);
	});

	test('merge local and remote profiles when there is base', () => {
		const localProfiles: IUserDataProfile[] = [
			toUserDataProfile('1', 'changed 1', URI.file('1')),
			toUserDataProfile('3', '3', URI.file('3')),
			toUserDataProfile('4', 'changed local', URI.file('4')),
			toUserDataProfile('5', '5', URI.file('5')),
			toUserDataProfile('6', '6', URI.file('6')),
			toUserDataProfile('8', '8', URI.file('8')),
		];
		const base: ISyncUserDataProfile[] = [
			{ id: '1', name: '1', collection: '1' },
			{ id: '2', name: '2', collection: '2' },
			{ id: '3', name: '3', collection: '3' },
			{ id: '4', name: '4', collection: '4' },
			{ id: '5', name: '5', collection: '5' },
			{ id: '6', name: '6', collection: '6' },
		];
		const remoteProfiles: ISyncUserDataProfile[] = [
			{ id: '1', name: '1', collection: '1' },
			{ id: '2', name: '2', collection: '2' },
			{ id: '3', name: '3', collection: '3', shortName: 'short 3' },
			{ id: '4', name: 'changed remote', collection: '4' },
			{ id: '5', name: '5', collection: '5' },
			{ id: '7', name: '7', collection: '7' },
		];

		const actual = merge(localProfiles, remoteProfiles, base, []);

		assert.deepStrictEqual(actual.local.added, [remoteProfiles[5]]);
		assert.deepStrictEqual(actual.local.removed, [localProfiles[4]]);
		assert.deepStrictEqual(actual.local.updated, [remoteProfiles[2], remoteProfiles[3]]);
		assert.deepStrictEqual(actual.remote?.added, [localProfiles[5]]);
		assert.deepStrictEqual(actual.remote?.updated, [localProfiles[0]]);
		assert.deepStrictEqual(actual.remote?.removed, [remoteProfiles[1]]);
	});

	test('merge local and remote profiles when there is base with ignored profiles', () => {
		const localProfiles: IUserDataProfile[] = [
			toUserDataProfile('1', 'changed 1', URI.file('1')),
			toUserDataProfile('3', '3', URI.file('3')),
			toUserDataProfile('4', 'changed local', URI.file('4')),
			toUserDataProfile('5', '5', URI.file('5')),
			toUserDataProfile('6', '6', URI.file('6')),
			toUserDataProfile('8', '8', URI.file('8')),
		];
		const base: ISyncUserDataProfile[] = [
			{ id: '1', name: '1', collection: '1' },
			{ id: '2', name: '2', collection: '2' },
			{ id: '3', name: '3', collection: '3' },
			{ id: '4', name: '4', collection: '4' },
			{ id: '5', name: '5', collection: '5' },
			{ id: '6', name: '6', collection: '6' },
		];
		const remoteProfiles: ISyncUserDataProfile[] = [
			{ id: '1', name: '1', collection: '1' },
			{ id: '2', name: '2', collection: '2' },
			{ id: '3', name: 'changed 3', collection: '3' },
			{ id: '4', name: 'changed remote', collection: '4' },
			{ id: '5', name: '5', collection: '5' },
			{ id: '7', name: '7', collection: '7' },
		];

		const actual = merge(localProfiles, remoteProfiles, base, ['4', '8']);

		assert.deepStrictEqual(actual.local.added, [remoteProfiles[5]]);
		assert.deepStrictEqual(actual.local.removed, [localProfiles[4]]);
		assert.deepStrictEqual(actual.local.updated, [remoteProfiles[2]]);
		assert.deepStrictEqual(actual.remote?.added, []);
		assert.deepStrictEqual(actual.remote?.updated, [localProfiles[0]]);
		assert.deepStrictEqual(actual.remote?.removed, [remoteProfiles[1]]);
	});

	test('merge when there are no remote changes', () => {
		const localProfiles: IUserDataProfile[] = [
			toUserDataProfile('1', '1', URI.file('1')),
		];
		const base: ISyncUserDataProfile[] = [
			{ id: '1', name: '1', collection: '1' },
		];
		const remoteProfiles: ISyncUserDataProfile[] = [
			{ id: '1', name: 'name changed', collection: '1' },
		];

		const actual = merge(localProfiles, remoteProfiles, base, []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, [remoteProfiles[0]]);
		assert.strictEqual(actual.remote, null);
	});

	test('merge when there are no local and remote changes', () => {
		const localProfiles: IUserDataProfile[] = [
			toUserDataProfile('1', '1', URI.file('1')),
		];
		const base: ISyncUserDataProfile[] = [
			{ id: '1', name: '1', collection: '1' },
		];
		const remoteProfiles: ISyncUserDataProfile[] = [
			{ id: '1', name: '1', collection: '1' },
		];

		const actual = merge(localProfiles, remoteProfiles, base, []);

		assert.deepStrictEqual(actual.local.added, []);
		assert.deepStrictEqual(actual.local.removed, []);
		assert.deepStrictEqual(actual.local.updated, []);
		assert.strictEqual(actual.remote, null);
	});

});
