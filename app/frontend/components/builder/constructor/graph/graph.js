'use strict';

angular.module('graph', [

]);

angular.module('graph')
	.directive('svgGraph', initComponent);


function initComponent() {

	const state = {
        DEFAULT: 0,
        MOVING: 1,
        JOINING: 2,
        DRAGGING: 3,
    }

    const events = {
        ADD_NODE: 'graph:addNode',
        REMOVE_NODE: 'graph:removeNode',
        ADD_LINK: 'graph:addLink',
        REMOVE_LINK: 'graph:removeLink',
        REMOVE_ITEMS: 'graph:removeItems'
    }

	function GraphController($scope, $rootScope, $window, $element, networkDataService, networkLayerService, coreService) {
		var self = this;

		self.counterNodesInit = 0;
		self.nodes = [];

		self.$onInit = function() {
            self.mouseMode = state.DEFAULT;
            self.links = [];
            self.activelink = {
                nodes: []
            };
            svgWatcher.bind(self)($scope, coreService);
            svgHandler.bind(self)($scope, $rootScope, $window, $element, networkDataService, networkLayerService);
		};

        $scope.controlItem.addNode = function(node) {
            self.nodes.push(node);
        }

        $scope.controlItem.setNodes = function(nodes) {

            if (arraysEqual(nodes, self.nodes)) {
                return false;
            }
            self.clearScene();
            for (let a = 0; a < nodes.length; a ++) {
                $scope.controlItem.addNode(nodes[a]);
            }
            return true;
        }

        $scope.controlItem.getNodes = function() {
            return self.nodes;
        }

		self.addNode = function(node) {
		    $scope.controlItem.addNode(node);
		    self.emitEvent(events.ADD_NODE, {});
		}

		self.addLink = function(link) {
		    self.links.push(link);
		    networkDataService.setChangesSaved(false);
		    self.emitEvent(events.ADD_LINK, {});
		}

		self.clearScene = function() {
            self.nodes.length = 0;
            self.links.length = 0;
            self.counterNodesInit = 0;
            coreService.param('scale', 1);
		}
		self.emitEvent = function(eventType, data) {
            $scope.$emit(eventType, data);
		}
	}

	return {
		restrict: 'E',
		controller: GraphController,
		controllerAs: 'svg',
		replace: true,
		scope: {
		    controlItem: '=',
		    svgWidth: '@',
		    svgHeight: '@',
		    svgColor: '@'
		},
		templateUrl: 'frontend/components/builder/constructor/graph/graph.html',

		link: function($scope, element, attrs) {

        }
	}

	function svgWatcher(scope, coreService) {
	    var self = this;
        scope.$watch(function () {
                return coreService.param('scale');
            }, function(newValue, oldValue) {
                self.scale = newValue;
                self.width = self.scale * scope.svgWidth;
                self.height = self.scale * scope.svgWidth;
            }
        );
    }

	function svgHandler($scope, $rootScope,$window, $element, networkDataService, networkLayerService) {
		var self = this;

		self.isItemClicked = false;

		var prevMousePos = [0,0];
		var editedNode = {};
		var parentNode = angular.element($element[0].parentNode);

		var positionDrag = {x:0, y: 0};

        // Custom events:
		
		networkDataService.subClearNetworkEvent(function ($event, data) {
			self.clearScene();
		});

        $scope.$on('nodeInit', function (event, data) {
			self.counterNodesInit ++;

			if (self.counterNodesInit === self.nodes.length) {
				self.links = parseNodesForLinks(self.nodes);
			}
		});

		$rootScope.$on('palette_drag_start', function (event, data) {
			self.mouseMode = state.DRAGGING;
		});

		$rootScope.$on('palette_drag_end', function (event, data) {
			if (self.mouseMode === state.DRAGGING && positionDrag) {
				var pos = convertCoordinateFromClienToSvg($element, parentNode, positionDrag);
				positionDrag = false;
				var correctPos = { x: (pos.x - data.offset.x) / self.scale, y: (pos.y - data.offset.y) / self.scale};
				if (correctPos.x > 0 && correctPos.y > 0) {
					$scope.$apply( function() {
						var node = {
							id: self.nodes.length + 1,
							name : data.data.name,
							content : data.data.content,
							category : data.data.category,
							pos: correctPos,
							selected: false,
							template: data.data.template,
							params: data.data.params
						};
						self.addNode(node);
					});
				}
			}
		});

		$scope.$on('nodeMouseDown', function (event, data) {
			editedNode = getItemById(self.nodes, data.id);
			self.mouseMode = state.MOVING;
			prevMousePos = {x: editedNode.pos.x * self.scale + data.pos.x, y: editedNode.pos.y * self.scale + data.pos.y};
		});

		$scope.$on('nodeMouseUp', function (event, data) {
			if (self.mouseMode === state.MOVING) {
			} else if (self.mouseMode === state.JOINING) {
				removeActiveLink();
			}
            self.mouseMode = state.DEFAULT;
		});

		$scope.$on('portOutMouseDown', function (event, data) {
			var node = getItemById(self.nodes, data.id);
			self.mouseMode = state.JOINING;
			self.activelink.nodes.length = 0;
			self.activelink.nodes.push(node);
		});

		$scope.$on('portOutMouseUp', function (event, data) {
			if (self.mouseMode === state.JOINING) {
				removeActiveLink();
			}
            self.mouseMode = state.DEFAULT;
		});

		$scope.$on('portInMouseUp', function (event, data) {
			if (self.mouseMode === state.JOINING) {
				var nodeFrom = getItemById(self.nodes, self.activelink.nodes[0].id);
				var nodeTo = getItemById(self.nodes, data.id);

				var link = newLink();
				link.id = "" + nodeFrom.id + nodeTo.id;
				link.nodes = [nodeFrom, nodeTo];

				if (validateLink(link, self.links)) {
					if (nodeFrom.wires) {
						nodeFrom.wires.push[nodeTo.id];
					} else {
						nodeFrom.wires = [nodeTo.id];
					}

					$scope.$apply( function() {
						self.addLink(link);
					});
				}
                removeActiveLink();
			}
            self.mouseMode = state.DEFAULT;
		});

		$scope.$on('selectedItem', function (event, data) {
			self.isItemClicked = true;
		});

		//Mouse events:

		$element.on('dragover', function (event) {
			if (self.mouseMode === state.DRAGGING) {
				positionDrag = {x: event.clientX, y: event.clientY};
			}
		});

		$element.on('click', function (event) {
//		    $element[0].parentNode.focus();
			if (!self.isItemClicked) {
				$scope.$apply( function() {
					selectItems (self.nodes, false);
					selectItems (self.links, false);
				});
			}
			self.isItemClicked = false;
		});

		$element.on('mousemove', function (event) {

			if (self.mouseMode === state.MOVING && event.buttons === 1) {


				var curMousePos = getOffsetPos($element, event);

				var newNodePos = {
				    x: editedNode.pos.x += (curMousePos.x - prevMousePos.x) / self.scale,
				    y: editedNode.pos.y += (curMousePos.y - prevMousePos.y) / self.scale
				}
				if (newNodePos.x < 0)
				    newNodePos.x = 0;
				if (newNodePos.y < 0)
				    newNodePos.y = 0;
				$scope.$apply( function() {
					editedNode.pos.x = newNodePos.x;
					editedNode.pos.y = newNodePos.y;
//					console.log(editedNode.pos);
				});
				prevMousePos = curMousePos;
			} else if (self.mouseMode === state.JOINING  && event.buttons === 1) {
				var curMousePos = getOffsetPos($element, event);
				curMousePos.x =  curMousePos.x / self.scale;
				curMousePos.y =  curMousePos.y / self.scale;
				$scope.$apply( function() {
					if (self.activelink.nodes.length === 1) {
						self.activelink.nodes.push({
							id: 'activePoint',
							pos: curMousePos
						});
					} else {
						self.activelink.nodes[1].pos = curMousePos;
					}
				});
			}
		});

		$element.on('mouseup', function (event) {
			if (self.mouseMode === state.JOINING) {
				removeActiveLink();
				self.mouseMode = state.DEFAULT;
			}
            self.mouseMode = state.DEFAULT;
		});

		$element.on('mouseleave', function (event) {
            if (self.mouseMode === state.MOVING) {
                self.mouseMode = state.DEFAULT;
            }
		});

        // keyboard events:
        var parentNode = angular.element($element[0].parentNode);

		parentNode.on('keydown', function (event) {
			if (event.keyCode === 46) {
				$scope.$apply( function() {
					removeSelectedItems(self.nodes, self.links);
//					networkDataService.pubNetworkUpdateEvent();
				});
			}
		});

        // system events:
		$element.on('focus', function (event) {

		});

		function removeActiveLink() {
			$scope.$apply( function() {
				self.activelink.nodes.length = 0;
			});
		}

		function removeSelectedItems(nodes, links) {
            var delNodes = [];
            var delLinks = [];

            for (var i = 0; i < nodes.length; ++i) {
                if (nodes[i].selected) {
                    delNodes.push(i);
                }
            }

            for (var i = 0; i < links.length; ++i) {
                if (links[i].selected) {
                    delLinks.push(i);
                }
                else {
                    for (var a = 0; a < delNodes.length; ++a) {
                        var nodeId = nodes[delNodes[a]].id;
                        if (links[i].nodes[0].id === nodeId || links[i].nodes[1].id === nodeId) {
                            delLinks.push(i);
                            break;
                        }
                    }
                }
            }

            var counterDel = 0;
            for (var i = 0; i < delNodes.length; ++i) {
                nodes.splice(delNodes[i] - counterDel, 1);
                counterDel ++;
            }

            counterDel = 0;
            for (var i = 0; i < delLinks.length; ++i) {
                links.splice(delLinks[i] - counterDel, 1);
                counterDel ++;
            }

            if (delNodes.length > 0 && delLinks.length > 0)
                self.emitEvent(events.REMOVE_ITEMS, {});
            else if (delNodes.length > 0)
                self.emitEvent(events.REMOVE_NODE, {});
            else if (delLinks.length > 0)
                self.emitEvent(events.REMOVE_LINK, {});
        }

	}

	function parseNodesForLinks(nodes) {
		var links = [];
		nodes.forEach(function(node, i, array) {
			if (node.wires  && node.wires.length > 0) {
				for (var a = 0; a < node.wires.length; ++a) {
					let nodeTo = getItemById(nodes, node.wires[a]);

					let link = newLink();
					link.id = "" + node.id + nodeTo.id;
					link.nodes = [node, nodeTo];
					links.push(link);
				}
			}
		});

		return links;
	}

	function getItemById(array, id) {
		for (var i = 0; i < array.length ; i ++) {
			if (array[i].id === id) {
				return array[i];
			}
		}
		return {};
	}

	function selectItems (array, options) {
		if (typeof options == 'undefined') {
			for(var i = 0; i < array.length; ++i) {
				array[i].selected = true;
			}
		} else {
			for(var i = 0; i < array.length; ++i) {
				array[i].selected = options;
			}
		}
	}

	function convertCoordinateFromClienToSvg($element, parentNode, clientCoord) {
		var parentScrollPos = {
			x: parentNode.scrollLeft ? parentNode.scrollLeft: 0,
			y: parentNode.scrollTop ? parentNode.scrollTop: 0
		};

		var svgRect = $element[0].getBoundingClientRect();

		return {
			x: clientCoord.x - svgRect.left +  parentScrollPos.x,
			y: clientCoord.y - svgRect.top + parentScrollPos.y
		};
	}

	function getOffsetPos(element, event) {
		var elementRect = element[0].getBoundingClientRect();
		return {x: event.clientX - elementRect.left, y: event.clientY - elementRect.top};
	}

	function newLink() {
		return {
			id: '',
			nodes: [],
			selected: false
		}
	}

	function validateLink (link, links) {
		for (var i = 0; i < links.length; ++i) {
			if (link.id === links[i].id) {
				return false;
			}
		}
		return true;
	}

	function arraysEqual(a, b) {
        if (a == null || b == null) return false;
        if (a.length != b.length) return false;

        for (var i = 0; i < a.length; ++i) {
            if (a[i] !== b[i])
                return false;
        }
        return true;
	}
}