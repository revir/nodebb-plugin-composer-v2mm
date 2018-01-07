'use strict';

/* globals define, utils, config, app */

define('composer/uploads', [
	'composer/preview',
	'composer/categoryList',
	'translator',
], function(preview, categoryList, translator) {
	var uploads = {
		inProgress: {}
	};

	var uploadingText = '';

	uploads.initialize = function(post_uuid) {
		initializeDragAndDrop(post_uuid);
		initializePaste(post_uuid);

		addChangeHandlers(post_uuid);
		addTopicThumbHandlers(post_uuid);
		translator.translate('[[modules:composer.uploading, ' + 0 + '%]]', function(translated) {
			uploadingText = translated;
		});
	};

	function addChangeHandlers(post_uuid) {
		var postContainer = $('#cmp-uuid-' + post_uuid);

		postContainer.find('#files').on('change', function(e) {
			var files = (e.target || {}).files || ($(this).val() ? [{name: $(this).val(), type: utils.fileMimeType($(this).val())}] : null);
			if (files) {
				uploadContentFiles({files: files, post_uuid: post_uuid, route: '/api/post/upload'});
			}
		});

		postContainer.find('#topic-thumb-file').on('change', function(e) {
			var files = (e.target || {}).files || ($(this).val() ? [{name: $(this).val(), type: utils.fileMimeType($(this).val())}] : null),
				fd;

			if (files) {
				if (window.FormData) {
					fd = new FormData();
					for (var i = 0; i < files.length; ++i) {
						fd.append('files[]', files[i], files[i].name);
					}
				}
				uploadTopicThumb({files: files, post_uuid: post_uuid, route: '/api/topic/thumb/upload', formData: fd});
			}
		});
	}

	function addTopicThumbHandlers(post_uuid) {
		var postContainer = $('#cmp-uuid-' + post_uuid);

		postContainer.on('click', '.topic-thumb-clear-btn', function(e) {
			postContainer.find('input#topic-thumb-url').val('').trigger('change');
			resetInputFile(postContainer.find('input#topic-thumb-file'));
			$(this).addClass('hide');
			e.preventDefault();
		});

		postContainer.on('paste change keypress', 'input#topic-thumb-url', function() {
			var urlEl = $(this);
			setTimeout(function(){
				var url = urlEl.val();
				if (url) {
					postContainer.find('.topic-thumb-clear-btn').removeClass('hide');
				} else {
					resetInputFile(postContainer.find('input#topic-thumb-file'));
					postContainer.find('.topic-thumb-clear-btn').addClass('hide');
				}
				postContainer.find('img.topic-thumb-preview').attr('src', url);
			}, 100);
		});
	}

	uploads.toggleThumbEls = function(postContainer, url) {
		var thumbToggleBtnEl = postContainer.find('.topic-thumb-toggle-btn');

		postContainer.find('input#topic-thumb-url').val(url);
		postContainer.find('img.topic-thumb-preview').attr('src', url);
		if (url) {
			postContainer.find('.topic-thumb-clear-btn').removeClass('hide');
		}
		thumbToggleBtnEl.removeClass('hide');
		thumbToggleBtnEl.off('click').on('click', function() {
			var container = postContainer.find('.topic-thumb-container');
			container.toggleClass('hide', !container.hasClass('hide'));
		});
	};

	function resetInputFile($el) {
		$el.wrap('<form />').closest('form').get(0).reset();
		$el.unwrap();
	}

	function initializeDragAndDrop(post_uuid) {

		function onDragEnter() {
			if (draggingDocument) {
				return;
			}

			drop.css('top', '0px');
			drop.css('height', postContainer.height() + 'px');
			drop.css('line-height', postContainer.height() + 'px');
			drop.show();

			drop.on('dragleave', function() {
				drop.hide();
				drop.off('dragleave');
			});
		}

		function onDragDrop(e) {
			e.preventDefault();
			var files = e.originalEvent.dataTransfer.files;
			var fd;

			if (files.length) {
				if (window.FormData) {
					fd = new FormData();
					for (var i = 0; i < files.length; ++i) {
						fd.append('files[]', files[i], files[i].name);
					}
				}

				uploadContentFiles({
					files: files,
					post_uuid: post_uuid,
					route: '/api/post/upload',
					formData: fd
				});
			}

			drop.hide();
			return false;
		}

		function cancel(e) {
			e.preventDefault();
			return false;
		}

		var draggingDocument = false;

		var postContainer = $('#cmp-uuid-' + post_uuid);
		var drop = postContainer.find('.imagedrop');

		$(document).off('dragstart').on('dragstart', function() {
			draggingDocument = true;
		}).off('dragend').on('dragend', function() {
			draggingDocument = false;
		});

		postContainer.on('dragenter', onDragEnter);

		drop.on('dragover', cancel);
		drop.on('dragenter', cancel);
		drop.on('drop', onDragDrop);
	}

	function initializePaste(post_uuid) {
		$(window).off('paste').on('paste', function(event) {

			var items = (event.clipboardData || event.originalEvent.clipboardData || {}).items;

			[].some.call(items, function(item) {
				var blob = item.getAsFile();

				if (!blob) {
					return false;
				}

				var blobName = utils.generateUUID() + '-' + blob.name;

				var fd = null;
				if (window.FormData) {
					fd = new FormData();
					fd.append('files[]', blob, blobName);
				}

				uploadContentFiles({
					files: [blob],
					fileNames: [blobName],
					post_uuid: post_uuid,
					route: '/api/post/upload',
					formData: fd
				});

				return true;
			});
		});
	}

	function escapeRegExp(text) {
		return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
	}

	function insertText(str, index, insert) {
		return str.slice(0, index) + insert + str.slice(index);
	}

	function uploadContentFiles(params) {
		var files = params.files;
		var post_uuid = params.post_uuid;
		var postContainer = $('#cmp-uuid-' + post_uuid);
		var textarea = postContainer.find('textarea');
		var text = textarea.val();
		var uploadForm = postContainer.find('#fileForm');
		var doneUploading = false;
		uploadForm.attr('action', config.relative_path + params.route);

		var cid = categoryList.getSelectedCid();
		if (!cid && ajaxify.data.cid) {
			cid = ajaxify.data.cid;
		}

		for (var i = 0; i < files.length; ++i) {
			var isImage = files[i].type.match(/image./);
			// if ((isImage && !app.user.privileges['upload:post:image']) || (!isImage && !app.user.privileges['upload:post:file'])) {
			// 	return app.alertError('[[error:no-privileges]]');
			// }
		}

		var filenameMapping = [];

		for (var i = 0; i < files.length; ++i) {
			filenameMapping.push(i + '_' + Date.now() + '_' + (params.fileNames ? params.fileNames[i] : files[i].name));
			var isImage = files[i].type.match(/image./);

			if (files[i].size > parseInt(config.maximumFileSize, 10) * 1024) {
				uploadForm[0].reset();
				return app.alertError('[[error:file-too-big, ' + config.maximumFileSize + ']]');
			}

			text = insertText(text, textarea.getCursorPosition(), (isImage ? '!' : '') + '[' + filenameMapping[i] + '](' + uploadingText + ') ');
		}

		textarea.val(text);

		uploadForm.off('submit').submit(function() {
			function updateTextArea(filename, text) {
				var current = textarea.val();
				var re = new RegExp(escapeRegExp(filename) + "]\\([^)]+\\)", 'g');
				textarea.val(current.replace(re, filename + '](' + text + ')'));
			}

			uploads.inProgress[post_uuid] = uploads.inProgress[post_uuid] || [];
			uploads.inProgress[post_uuid].push(1);

			if (params.formData) {
				params.formData.append('cid', cid);
			}

			$(this).ajaxSubmit({
				headers: {
					'x-csrf-token': config.csrf_token
				},
				resetForm: true,
				clearForm: true,
				formData: params.formData,
				data: { cid: cid },

				error: onUploadError,

				uploadProgress: function(event, position, total, percent) {
					translator.translate('[[modules:composer.uploading, ' + percent + '%]]', function(translated) {
						if (doneUploading) {
							return;
						}
						for (var i=0; i < files.length; ++i) {
							updateTextArea(filenameMapping[i], translated);
						}
					});
				},

				success: function(uploads) {
					doneUploading = true;
					if (uploads && uploads.length) {
						for (var i=0; i<uploads.length; ++i) {
							updateTextArea(filenameMapping[i], uploads[i].url);
						}
					}
					preview.render(postContainer);
					textarea.focus();
				},

				complete: function() {
					uploadForm[0].reset();
					uploads.inProgress[post_uuid].pop();
				}
			});

			return false;
		});

		uploadForm.submit();
	}

	function uploadTopicThumb(params) {
		var post_uuid = params.post_uuid,
			postContainer = $('#cmp-uuid-' + post_uuid),
			spinner = postContainer.find('.topic-thumb-spinner'),
			thumbForm = postContainer.find('#thumbForm');

		thumbForm.attr('action', config.relative_path + params.route);

		thumbForm.off('submit').submit(function() {
			spinner.removeClass('hide');

			uploads.inProgress[post_uuid] = uploads.inProgress[post_uuid] || [];
			uploads.inProgress[post_uuid].push(1);

			$(this).ajaxSubmit({
				headers: {
					'x-csrf-token': config.csrf_token
				},
				formData: params.formData,
				error: onUploadError,
				success: function(uploads) {
					postContainer.find('#topic-thumb-url').val((uploads[0] || {}).url || '').trigger('change');
				},
				complete: function() {
					uploads.inProgress[post_uuid].pop();
					spinner.addClass('hide');
				}
			});
			return false;
		});
		thumbForm.submit();
	}

	function onUploadError(xhr) {
		var msg = (xhr.responseJSON && xhr.responseJSON.error) || '[[error:parse-error]]';
		if (xhr && xhr.status === 413) {
			msg = xhr.statusText || 'Request Entity Too Large';
		}
		app.alertError(msg);
	}

	return uploads;
});
