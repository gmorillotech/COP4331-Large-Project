import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;

import 'package:app_links/app_links.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_application_1/account_center/account_center_page.dart';
import 'package:flutter_application_1/auth/auth_service.dart';
import 'package:flutter_application_1/auth/login_page.dart';
import 'package:flutter_application_1/auth/reset_password_page.dart';
import 'package:flutter_application_1/data_collection/data_collection_screen.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

const String _configuredMapApiBaseUrl = String.fromEnvironment('MAP_API_BASE_URL');
const String _loginRoute = '/login';
const String _mapRoute = '/map';
const String _dataCollectionRoute = '/data-collection';
const String _accountCenterRoute = '/account-center';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final prefs = await SharedPreferences.getInstance();
  runApp(MainApp(prefs: prefs));
}

class MainApp extends StatefulWidget {
  const MainApp({super.key, required this.prefs});

  final SharedPreferences prefs;

  @override
  State<MainApp> createState() => _MainAppState();
}

class _MainAppState extends State<MainApp> {
  late final AuthService _authService;
  late final AppLinks _appLinks;
  StreamSubscription<Uri>? _linkSubscription;
  final _navigatorKey = GlobalKey<NavigatorState>();

  @override
  void initState() {
    super.initState();
    _authService = AuthService(prefs: widget.prefs)..initialize();
    _appLinks = AppLinks();
    _linkSubscription = _appLinks.uriLinkStream.listen(_handleDeepLink);
  }

  @override
  void dispose() {
    _linkSubscription?.cancel();
    _authService.dispose();
    super.dispose();
  }

  void _handleDeepLink(Uri uri) {
    if (uri.path == '/reset-password') {
      final token = uri.queryParameters['token'];
      if (token != null && token.isNotEmpty) {
        _navigatorKey.currentState?.push(
          MaterialPageRoute<void>(
            builder: (_) => ResetPasswordPage(token: token),
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider<AuthService>.value(
      value: _authService,
      child: Consumer<AuthService>(
        builder: (context, auth, _) {
          return MaterialApp(
            navigatorKey: _navigatorKey,
            debugShowCheckedModeBanner: false,
            title: 'Study Space Map',
            theme: ThemeData(useMaterial3: true),
            home: auth.initializing
                ? const Scaffold(
                    body: Center(child: CircularProgressIndicator()))
                : auth.isAuthenticated
                    ? const MapSearchPage()
                    : const LoginPage(),
            routes: {
              _loginRoute: (_) => const LoginPage(),
              if (auth.isAuthenticated) ...{
                _mapRoute: (_) => const MapSearchPage(),
                _dataCollectionRoute: (_) => const DataCollectionScreen(),
                _accountCenterRoute: (_) => const AccountCenterPage(),
              },
            },
          );
        },
      ),
    );
  }
}

enum Severity { low, medium, high }
enum NodeKind { group, location }
enum SearchSort { relevance, distance, noise, occupancy }

const List<LocationRecord> _seededRecords = [
  LocationRecord(
    id: 'library-floor-1-quiet',
    title: 'Quiet Study',
    buildingName: 'John C. Hitt Library',
    floorLabel: 'Floor 1',
    sublocationLabel: 'North Reading Room',
    summary: 'Good for focused work with light foot traffic.',
    statusText: 'Usually quiet at this time',
    noiseText: 'Quiet',
    occupancyText: '2 users',
    updatedAtLabel: 'Updated 2 minutes ago',
    position: LatLng(28.60024, -81.20182),
    color: Color(0xFF2A9D8F),
    severity: Severity.low,
    isFavorite: true,
  ),
  LocationRecord(
    id: 'library-floor-2-moderate',
    title: 'Collaboration Tables',
    buildingName: 'John C. Hitt Library',
    floorLabel: 'Floor 2',
    sublocationLabel: 'West Commons',
    summary: 'Conversation-friendly seating with moderate ambient sound.',
    statusText: 'Moderate buzz near group tables',
    noiseText: 'Moderate',
    occupancyText: '9 users',
    updatedAtLabel: 'Updated 4 minutes ago',
    position: LatLng(28.60036, -81.20168),
    color: Color(0xFFFF9F1C),
    severity: Severity.medium,
    isFavorite: false,
  ),
  LocationRecord(
    id: 'library-floor-3-busy',
    title: 'Open Computer Lab',
    buildingName: 'John C. Hitt Library',
    floorLabel: 'Floor 3',
    sublocationLabel: 'Digital Media Area',
    summary: 'High circulation zone with steady keyboard and discussion noise.',
    statusText: 'Busiest floor in the building',
    noiseText: 'Busy',
    occupancyText: '18 users',
    updatedAtLabel: 'Updated 1 minute ago',
    position: LatLng(28.60048, -81.20155),
    color: Color(0xFFD9485F),
    severity: Severity.high,
    isFavorite: false,
  ),
  LocationRecord(
    id: 'library-floor-4-empty',
    title: 'Silent Study Cubicles',
    buildingName: 'John C. Hitt Library',
    floorLabel: 'Floor 4',
    sublocationLabel: 'East Quiet Wing',
    summary: 'Sparse traffic and the calmest option in the library right now.',
    statusText: 'Mostly empty',
    noiseText: 'Very quiet',
    occupancyText: '1 user',
    updatedAtLabel: 'Updated 6 minutes ago',
    position: LatLng(28.60018, -81.20198),
    color: Color(0xFF2A9D8F),
    severity: Severity.low,
    isFavorite: true,
  ),
  LocationRecord(
    id: 'msb-floor-2-moderate',
    title: 'Study Nook',
    buildingName: 'Mathematical Sciences Building',
    floorLabel: 'Floor 2',
    sublocationLabel: 'Atrium Balcony',
    summary: 'Reliable seating between classes with moderate hallway spillover.',
    statusText: 'Moderate between class blocks',
    noiseText: 'Moderate',
    occupancyText: '6 users',
    updatedAtLabel: 'Updated 7 minutes ago',
    position: LatLng(28.60116, -81.19886),
    color: Color(0xFF3A86FF),
    severity: Severity.medium,
    isFavorite: false,
  ),
  LocationRecord(
    id: 'student-union-food-court',
    title: 'Food Court Seating',
    buildingName: 'Student Union',
    floorLabel: 'Level 1',
    sublocationLabel: 'South Dining Hall',
    summary: 'Convenient seating but consistently loud during lunch hours.',
    statusText: 'Lunch rush is active',
    noiseText: 'Loud',
    occupancyText: '21 users',
    updatedAtLabel: 'Updated just now',
    position: LatLng(28.60192, -81.19994),
    color: Color(0xFFD9485F),
    severity: Severity.high,
    isFavorite: false,
  ),
];

class LocationRecord {
  const LocationRecord({
    required this.id,
    required this.title,
    required this.buildingName,
    required this.floorLabel,
    required this.sublocationLabel,
    required this.summary,
    required this.statusText,
    required this.noiseText,
    required this.occupancyText,
    required this.updatedAtLabel,
    required this.position,
    required this.color,
    required this.severity,
    required this.isFavorite,
  });

  final String id;
  final String title;
  final String buildingName;
  final String floorLabel;
  final String sublocationLabel;
  final String summary;
  final String statusText;
  final String noiseText;
  final String occupancyText;
  final String updatedAtLabel;
  final LatLng position;
  final Color color;
  final Severity severity;
  final bool isFavorite;

  factory LocationRecord.fromJson(Map<String, dynamic> json) {
    return LocationRecord(
      id: (json['id'] as String? ?? '').trim(),
      title: (json['title'] as String? ?? 'Study Location').trim(),
      buildingName: (json['buildingName'] as String? ?? 'Unknown Building').trim(),
      floorLabel: (json['floorLabel'] as String? ?? 'Floor unknown').trim(),
      sublocationLabel: (json['sublocationLabel'] as String? ?? 'Unknown spot').trim(),
      summary: (json['summary'] as String? ?? 'No summary available.').trim(),
      statusText: (json['statusText'] as String? ?? 'Status unavailable').trim(),
      noiseText: _trimMetric(json['noiseText'] as String?, 'Noise unavailable'),
      occupancyText: _trimMetric(json['occupancyText'] as String?, 'Occupancy unavailable'),
      updatedAtLabel: (json['updatedAtLabel'] as String? ?? 'Update time unavailable').trim(),
      position: LatLng(
        (json['lat'] as num?)?.toDouble() ?? 0,
        (json['lng'] as num?)?.toDouble() ?? 0,
      ),
      color: _colorFromHex((json['color'] as String?) ?? '#3A86FF'),
      severity: _severityFromString(json['severity'] as String?),
      isFavorite: json['isFavorite'] as bool? ?? false,
    );
  }
}

class MapNode {
  const MapNode({
    required this.id,
    required this.kind,
    required this.title,
    required this.buildingName,
    required this.summary,
    required this.statusText,
    required this.noiseText,
    required this.occupancyText,
    required this.updatedAtLabel,
    required this.position,
    required this.color,
    required this.severity,
    required this.searchTerms,
    required this.badge,
    this.floorLabel,
    this.groupId,
    this.sublocationLabel,
    this.locationCount = 0,
    this.isFavorite = false,
    this.noiseValue,
    this.occupancyValue,
    this.distanceMeters,
  });

  final String id;
  final NodeKind kind;
  final String title;
  final String buildingName;
  final String summary;
  final String statusText;
  final String noiseText;
  final String occupancyText;
  final String updatedAtLabel;
  final LatLng position;
  final Color color;
  final Severity severity;
  final String searchTerms;
  final String badge;
  final String? floorLabel;
  final String? groupId;
  final String? sublocationLabel;
  final int locationCount;
  final bool isFavorite;
  final double? noiseValue;
  final double? occupancyValue;
  final double? distanceMeters;

  bool get isGroup => kind == NodeKind.group;

  factory MapNode.fromJson(Map<String, dynamic> json) {
    final rawKind = (json['kind'] as String? ?? 'location').trim().toLowerCase();
    return MapNode(
      id: (json['id'] as String? ?? '').trim(),
      kind: rawKind == 'group' ? NodeKind.group : NodeKind.location,
      title: (json['title'] as String? ?? 'Study Location').trim(),
      buildingName: (json['buildingName'] as String? ?? 'Unknown Building').trim(),
      summary: (json['summary'] as String? ?? 'No summary available.').trim(),
      statusText: (json['statusText'] as String? ?? 'Status unavailable').trim(),
      noiseText: _trimMetric(json['noiseText'] as String?, 'Noise unavailable'),
      occupancyText: _trimMetric(json['occupancyText'] as String?, 'Occupancy unavailable'),
      updatedAtLabel: (json['updatedAtLabel'] as String? ?? 'Update time unavailable').trim(),
      position: LatLng(
        (json['lat'] as num?)?.toDouble() ?? 0,
        (json['lng'] as num?)?.toDouble() ?? 0,
      ),
      color: _colorFromHex((json['color'] as String?) ?? '#3A86FF'),
      severity: _severityFromString(json['severity'] as String?),
      searchTerms: [
        json['buildingName'],
        json['title'],
        json['floorLabel'],
        json['sublocationLabel'],
      ].whereType<String>().join(' ').toLowerCase(),
      badge: ((json['badge'] as String?) ?? '').trim().isNotEmpty
          ? (json['badge'] as String).trim()
          : (rawKind == 'group'
              ? ((json['buildingName'] as String? ?? 'B').substring(0, 1).toUpperCase())
              : _badgeForFloor(
                  (json['floorLabel'] as String? ?? '').trim(),
                  (json['title'] as String? ?? 'S').trim(),
                )),
      floorLabel: (json['floorLabel'] as String?)?.trim(),
      groupId: (json['groupId'] as String?)?.trim(),
      sublocationLabel: (json['sublocationLabel'] as String?)?.trim(),
      locationCount: (json['locationCount'] as num?)?.toInt() ?? 0,
      isFavorite: json['isFavorite'] as bool? ?? false,
      noiseValue: (json['noiseValue'] as num?)?.toDouble(),
      occupancyValue: (json['occupancyValue'] as num?)?.toDouble(),
      distanceMeters: (json['distanceMeters'] as num?)?.toDouble(),
    );
  }
}

class MapSearchPage extends StatefulWidget {
  const MapSearchPage({super.key});

  @override
  State<MapSearchPage> createState() => _MapSearchPageState();
}

class _MapSearchPageState extends State<MapSearchPage> {
  static const CameraPosition _defaultCamera = CameraPosition(
    target: LatLng(28.6003, -81.2012),
    zoom: 15.4,
  );
  static const double _groupZoomThreshold = 16.35;

  final _searchController = TextEditingController();
  final _noiseMinController = TextEditingController();
  final _noiseMaxController = TextEditingController();
  final _occupancyMaxController = TextEditingController();
  final _mapViewportKey = GlobalKey();
  GoogleMapController? _mapController;
  Timer? _debounce;
  Timer? _filterDebounce;
  int _searchRequestId = 0;

  List<MapNode> _records = const [];
  List<MapNode> _groups = const [];
  Map<String, Offset> _screenPoints = const {};
  String _status = 'Loading map data...';
  String _query = '';
  String? _selectedId;
  Severity? _filter;
  bool _loading = true;
  bool _detailsExpanded = false;
  bool _projectionPending = false;
  double _zoom = _defaultCamera.zoom;
  final LatLng _cameraCenter = _defaultCamera.target;
  List<SearchSort?> _sortOrder = const [SearchSort.relevance, SearchSort.distance, null];
  double _maxRadiusMeters = 300;
  double? _minNoise;
  double? _maxNoise;
  double? _maxOccupancy;
  bool _showAllResults = true;
  bool _showBuildings = true;
  bool _showSpots = true;
  bool _showUsers = false;

  String get _baseUrl {
    if (_configuredMapApiBaseUrl.isNotEmpty) {
      return _configuredMapApiBaseUrl;
    }

    if (kIsWeb) {
      return 'http://localhost:5050';
    }

    if (Platform.isAndroid) {
      return 'http://10.0.2.2:5050';
    }

    return 'http://localhost:5050';
  }

  bool get _showGroups => _zoom < _groupZoomThreshold;
  List<MapNode> get _locations => _records.where((n) => !n.isGroup).toList(growable: false);
  List<MapNode> get _visibleNodes => _filtered(_showGroups ? _groups : _locations);
  List<MapNode> get _results {
    if (_query.isEmpty) return _visibleNodes;
    return _filtered([..._groups, ..._locations].where((n) => n.searchTerms.contains(_query)).toList());
  }

  MapNode? get _selected {
    for (final node in [..._results, ..._groups, ..._locations]) {
      if (node.id == _selectedId) return node;
    }
    return _results.isNotEmpty ? _results.first : null;
  }

  @override
  void initState() {
    super.initState();
    unawaited(_runSearch(showLoading: true));
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _filterDebounce?.cancel();
    _searchController.dispose();
    _noiseMinController.dispose();
    _noiseMaxController.dispose();
    _occupancyMaxController.dispose();
    _mapController?.dispose();
    super.dispose();
  }

  Future<void> _runSearch({bool showLoading = false}) async {
    final client = HttpClient()..connectionTimeout = const Duration(seconds: 6);
    final requestId = ++_searchRequestId;
    final includeGroups = _showAllResults || _showBuildings;
    final includeLocations = _showAllResults || _showSpots;
    final sortTerms = _sortOrder.whereType<SearchSort>().map((value) => value.name).toList(growable: false);
    final queryParameters = <String, String>{
      'sortBy': sortTerms.isEmpty ? SearchSort.relevance.name : sortTerms.join(','),
      'includeGroups': '$includeGroups',
      'includeLocations': '$includeLocations',
      'lat': _cameraCenter.latitude.toStringAsFixed(6),
      'lng': _cameraCenter.longitude.toStringAsFixed(6),
      'maxRadiusMeters': _maxRadiusMeters.round().toString(),
    };

    if (_query.isNotEmpty) {
      queryParameters['q'] = _query;
    }
    if (_minNoise != null) {
      queryParameters['minNoise'] = _minNoise!.toStringAsFixed(0);
    }
    if (_maxNoise != null) {
      queryParameters['maxNoise'] = _maxNoise!.toStringAsFixed(0);
    }
    if (_maxOccupancy != null) {
      queryParameters['maxOccupancy'] = _maxOccupancy!.toStringAsFixed(1);
    }

    if (showLoading || _results.isEmpty) {
      setState(() => _loading = true);
    }

    try {
      final uri = Uri.parse('$_baseUrl/api/locations/search').replace(queryParameters: queryParameters);
      final request = await client
          .getUrl(uri)
          .timeout(const Duration(seconds: 6));
      final response = await request.close().timeout(const Duration(seconds: 6));
      final text = await response.transform(utf8.decoder).join().timeout(
            const Duration(seconds: 6),
          );

      if (response.statusCode != 200) {
        throw HttpException('Map request failed with status ${response.statusCode}');
      }

      final payload = jsonDecode(text) as Map<String, dynamic>;
      final error = (payload['error'] as String? ?? '').trim();
      if (error.isNotEmpty) {
        throw HttpException(error);
      }

      final results = (payload['results'] as List<dynamic>? ?? const [])
          .map((entry) => MapNode.fromJson(Map<String, dynamic>.from(entry as Map)))
          .toList(growable: false);

      if (!mounted || requestId != _searchRequestId) {
        return;
      }

      _applyRecords(
        results,
        status: '${_buildGroups(results).length} buildings and ${results.length} study areas loaded',
      );
    } catch (error) {
      _applyRecords(
        _fallbackNodes(),
        status:
            'API unavailable at $_baseUrl. Using seeded map data for local testing.',
      );
    } finally {
      client.close(force: true);
    }
  }

  List<MapNode> _buildGroups(List<MapNode> nodes) =>
      nodes.where((n) => n.isGroup).toList(growable: false);

  void _applyRecords(List<MapNode> records, {required String status}) {
    final groups = _buildGroups(records);
    setState(() {
      _records = records;
      _groups = groups;
      _selectedId = groups.isNotEmpty ? groups.first.id : null;
      _status = status;
      _loading = false;
    });
    _scheduleProjectionRefresh();
  }

  List<MapNode> _fallbackNodes() {
    final locationNodes = _seededRecords
        .map(
          (record) => MapNode(
            id: record.id,
            kind: NodeKind.location,
            title: record.title,
            buildingName: record.buildingName,
            summary: record.summary,
            statusText: record.statusText,
            noiseText: record.noiseText,
            occupancyText: record.occupancyText,
            updatedAtLabel: record.updatedAtLabel,
            position: record.position,
            color: record.color,
            severity: record.severity,
            searchTerms: '${record.buildingName} ${record.floorLabel} ${record.sublocationLabel} ${record.title}'.toLowerCase(),
            badge: _badgeForFloor(record.floorLabel, record.title),
            floorLabel: record.floorLabel,
            groupId: _groupId(record.buildingName),
            sublocationLabel: record.sublocationLabel,
            isFavorite: record.isFavorite,
          ),
        )
        .toList(growable: false);

    final grouped = <String, List<MapNode>>{};
    for (final node in locationNodes) {
      grouped.putIfAbsent(node.buildingName, () => []).add(node);
    }

    final groupNodes = grouped.entries.map((entry) {
      final items = entry.value;
      final lat = items.map((e) => e.position.latitude).reduce((a, b) => a + b) / items.length;
      final lng = items.map((e) => e.position.longitude).reduce((a, b) => a + b) / items.length;
      final severityIndex = items.map((e) => e.severity.index).reduce((a, b) => a > b ? a : b);
      final quietCount = items.where((e) => e.severity == Severity.low).length;
      return MapNode(
        id: _groupId(entry.key),
        kind: NodeKind.group,
        title: entry.key,
        buildingName: entry.key,
        summary: '${items.length} study areas, $quietCount quiet option${quietCount == 1 ? '' : 's'}.',
        statusText: 'Building overview',
        noiseText: _severityLabel(Severity.values[severityIndex]),
        occupancyText: '${items.length} reported study areas',
        updatedAtLabel: items.first.updatedAtLabel,
        position: LatLng(lat, lng),
        color: items.first.color,
        severity: Severity.values[severityIndex],
        searchTerms: items.expand((e) => [entry.key, e.floorLabel ?? '', e.sublocationLabel ?? '', e.title]).join(' ').toLowerCase(),
        badge: entry.key.substring(0, 1).toUpperCase(),
        locationCount: items.length,
        isFavorite: items.any((e) => e.isFavorite),
      );
    }).toList(growable: false);

    final nodes = <MapNode>[
      if (_showAllResults || _showBuildings) ...groupNodes,
      if (_showAllResults || _showSpots) ...locationNodes,
    ];

    return nodes.where((node) => _query.isEmpty || node.searchTerms.contains(_query)).toList(growable: false);
  }

  List<MapNode> _filtered(List<MapNode> nodes) => _filter == null ? nodes : nodes.where((n) => n.severity == _filter).toList();

  void _onSearch(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 180), () {
      if (!mounted) return;
      setState(() => _query = value.trim().toLowerCase());
      unawaited(_runSearch());
    });
  }

  void _setSortAt(int index, SearchSort? sort) {
    final nextOrder = [..._sortOrder];
    nextOrder[index] = sort;
    final normalized = <SearchSort?>[];
    final seen = <SearchSort>{};
    for (final value in nextOrder) {
      if (value == null) {
        normalized.add(null);
      } else if (seen.add(value)) {
        normalized.add(value);
      } else {
        normalized.add(null);
      }
    }
    setState(() => _sortOrder = normalized);
    unawaited(_runSearch());
  }

  void _scheduleFilterSearch() {
    _filterDebounce?.cancel();
    _filterDebounce = Timer(const Duration(milliseconds: 250), () {
      if (!mounted) return;
      unawaited(_runSearch());
    });
  }

  void _toggleShowAll(bool value) {
    setState(() {
      _showAllResults = value;
      _showBuildings = value;
      _showSpots = value;
      _showUsers = value;
    });
    unawaited(_runSearch());
  }

  void _toggleShowItem({required bool value, required void Function(bool) assign}) {
    setState(() {
      assign(value);
      _showAllResults = _showBuildings && _showSpots && _showUsers;
    });
    unawaited(_runSearch());
  }

  void _setRadius(double value) {
    setState(() => _maxRadiusMeters = value);
    unawaited(_runSearch());
  }

  void _onNoiseChanged() {
    setState(() {
      _minNoise = double.tryParse(_noiseMinController.text.trim());
      _maxNoise = double.tryParse(_noiseMaxController.text.trim());
    });
    _scheduleFilterSearch();
  }

  void _onOccupancyChanged(String value) {
    setState(() => _maxOccupancy = double.tryParse(value.trim()));
    _scheduleFilterSearch();
  }

  Future<void> _focusNode(MapNode node) async {
    final targetNode = node.isGroup
        ? _locations.firstWhere(
            (candidate) => candidate.groupId == node.id,
            orElse: () => node,
          )
        : node;

    setState(() {
      _selectedId = targetNode.id;
      _detailsExpanded = false;
      _screenPoints = const {};
    });

    await _mapController?.animateCamera(
      CameraUpdate.newCameraPosition(
        CameraPosition(
          target: node.position,
          zoom: node.isGroup ? 17.15 : 18.05,
        ),
      ),
    );
  }

  void _onCameraMove(CameraPosition position) {
    final previousGroupView = _showGroups;
    final nextZoom = position.zoom;
    final nextGroupView = nextZoom < _groupZoomThreshold;
    if (nextZoom == _zoom) return;
    setState(() {
      _zoom = nextZoom;
      _screenPoints = const {};
    });
    if (previousGroupView != nextGroupView) _syncSelectionToZoom(nextGroupView);
    _scheduleProjectionRefresh();
  }

  void _scheduleProjectionRefresh() {
    if (_projectionPending) return;
    _projectionPending = true;
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      _projectionPending = false;
      await _refreshOverlayProjection();
    });
  }

  Future<void> _refreshOverlayProjection() async {
    final controller = _mapController;
    final context = _mapViewportKey.currentContext;

    if (!mounted || controller == null || context == null) {
      return;
    }

    final box = context.findRenderObject() as RenderBox?;

    if (box == null || !box.hasSize) {
      return;
    }

    final devicePixelRatio = MediaQuery.of(context).devicePixelRatio;
    final nextPoints = <String, Offset>{};

    for (final node in _visibleNodes) {
      final screenCoordinate = await controller.getScreenCoordinate(node.position);
      final dx = screenCoordinate.x / devicePixelRatio;
      final dy = screenCoordinate.y / devicePixelRatio;

      if (dx < -80 || dy < -80 || dx > box.size.width + 80 || dy > box.size.height + 80) {
        continue;
      }

      nextPoints[node.id] = Offset(dx, dy);
    }

    if (!mounted) {
      return;
    }

    setState(() {
      _screenPoints = nextPoints;
    });
  }

  void _syncSelectionToZoom(bool groupView) {
    final selected = _selected;
    if (selected == null) return;
    if (groupView && !selected.isGroup && selected.groupId != null) {
      setState(() {
        _selectedId = selected.groupId;
        _detailsExpanded = false;
      });
    } else if (!groupView && selected.isGroup) {
      final child = _locations.where((n) => n.groupId == selected.id).cast<MapNode?>().firstWhere((n) => n != null, orElse: () => null);
      if (child != null) {
        setState(() {
          _selectedId = child.id;
          _detailsExpanded = false;
        });
      }
    }
  }

  String _usersPresentText(MapNode node) {
    if (node.isGroup) {
      return '${node.locationCount} active study areas';
    }

    final match = RegExp(r'(\d+)').firstMatch(node.occupancyText);
    final count = int.tryParse(match?.group(1) ?? '');
    if (count == null) {
      return node.occupancyText;
    }
    return count == 1 ? '1 user present' : '$count users present';
  }

  String _usualBusinessText(MapNode node) {
    if (node.isGroup) {
      return 'Aggregated building activity from nearby study spots';
    }
    return node.statusText;
  }

  Future<void> _openDataCollection() async {
    final selected = _selected;
    final selectedLocationId = selected != null && !selected.isGroup ? selected.id : null;

    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) => DataCollectionScreen(
          initialStudyLocationId: selectedLocationId,
        ),
      ),
    );

    if (!mounted) {
      return;
    }

    unawaited(_runSearch(showLoading: true));
  }

  Future<void> _openAccountCenter() async {
    await Navigator.of(context).pushNamed(_accountCenterRoute);
  }

  @override
  Widget build(BuildContext context) {
    final selected = _selected;
    return Scaffold(
      backgroundColor: const Color(0xFFF3F7FB),
      appBar: AppBar(
        title: const Text('Study Space Search'),
        backgroundColor: Colors.transparent,
        actions: [
          IconButton(
            tooltip: 'Open account center',
            onPressed: _openAccountCenter,
            icon: const Icon(Icons.account_circle_outlined),
          ),
          IconButton(
            tooltip: 'Open data collection',
            onPressed: _openDataCollection,
            icon: const Icon(Icons.mic_rounded),
          ),
        ],
      ),
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            final topPanelHeight = math.min(360.0, math.max(260.0, constraints.maxHeight * 0.36));
            return Column(
              children: [
                SizedBox(
                  height: topPanelHeight,
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('Search from the current map center', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
                      const SizedBox(height: 8),
                      Text('Backend search supports ordered sorting, numeric noise bounds, occupancy caps, distance limits, and result visibility toggles.', style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: const Color(0xFF486581))),
                      const SizedBox(height: 12),
                      TextField(
                        controller: _searchController,
                        onChanged: (value) {
                          setState(() {});
                          _onSearch(value);
                        },
                        decoration: InputDecoration(
                          hintText: 'Search Library or Quiet Study',
                          prefixIcon: const Icon(Icons.search),
                          suffixIcon: _searchController.text.isEmpty
                              ? null
                              : IconButton(
                                  onPressed: () {
                                    _searchController.clear();
                                    setState(() {});
                                    _onSearch('');
                                  },
                                  icon: const Icon(Icons.close),
                                ),
                          filled: true,
                          fillColor: Colors.white,
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(20), borderSide: BorderSide.none),
                        ),
                      ),
                      const SizedBox(height: 12),
                      Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(22),
                          border: Border.all(color: const Color(0xFFD8E1EB)),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _sectionLabel('Sort Order'),
                            const SizedBox(height: 8),
                            _sortDropdown('1st by', 0),
                            const SizedBox(height: 8),
                            _sortDropdown('2nd by', 1),
                            const SizedBox(height: 8),
                            _sortDropdown('3rd by', 2),
                            const SizedBox(height: 14),
                            _sectionLabel('Distance'),
                            Slider(
                              value: _maxRadiusMeters,
                              min: 100,
                              max: 500,
                              divisions: 8,
                              label: '${_maxRadiusMeters.round()} m',
                              onChanged: (value) => setState(() => _maxRadiusMeters = value),
                              onChangeEnd: _setRadius,
                            ),
                            Align(
                              alignment: Alignment.centerRight,
                              child: Text(
                                'Up to ${_maxRadiusMeters.round()} m',
                                style: Theme.of(context).textTheme.bodySmall?.copyWith(color: const Color(0xFF486581)),
                              ),
                            ),
                            const SizedBox(height: 14),
                            _sectionLabel('Noise (dB)'),
                            const SizedBox(height: 8),
                            Row(
                              children: [
                                Expanded(
                                  child: _numberField(
                                    controller: _noiseMinController,
                                    label: 'Min',
                                    onChanged: (_) => _onNoiseChanged(),
                                  ),
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: _numberField(
                                    controller: _noiseMaxController,
                                    label: 'Max',
                                    onChanged: (_) => _onNoiseChanged(),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 14),
                            _sectionLabel('Max Occupancy'),
                            const SizedBox(height: 8),
                            _numberField(
                              controller: _occupancyMaxController,
                              label: '0.0 to 5.0',
                              onChanged: _onOccupancyChanged,
                            ),
                            const SizedBox(height: 14),
                            _sectionLabel('Show'),
                            const SizedBox(height: 8),
                            Wrap(
                              spacing: 10,
                              runSpacing: 6,
                              children: [
                                _showCheckbox(
                                  label: 'All results',
                                  value: _showAllResults,
                                  onChanged: (value) => _toggleShowAll(value ?? false),
                                ),
                                _showCheckbox(
                                  label: 'Buildings',
                                  value: _showBuildings,
                                  onChanged: (value) => _toggleShowItem(
                                    value: value ?? false,
                                    assign: (next) => _showBuildings = next,
                                  ),
                                ),
                                _showCheckbox(
                                  label: 'Spots',
                                  value: _showSpots,
                                  onChanged: (value) => _toggleShowItem(
                                    value: value ?? false,
                                    assign: (next) => _showSpots = next,
                                  ),
                                ),
                                _showCheckbox(
                                  label: 'Users',
                                  value: _showUsers,
                                  onChanged: (value) => _toggleShowItem(
                                    value: value ?? false,
                                    assign: (next) => _showUsers = next,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 10),
                      Text(_status, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: const Color(0xFF64748B))),
                    ]),
                  ),
                ),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(28),
                      child: Stack(children: [
                    RepaintBoundary(
                      key: _mapViewportKey,
                      child: GoogleMap(
                        initialCameraPosition: _defaultCamera,
                        markers: const <Marker>{},
                        myLocationButtonEnabled: false,
                        mapToolbarEnabled: false,
                        zoomControlsEnabled: false,
                        onMapCreated: (controller) {
                          _mapController = controller;
                          _scheduleProjectionRefresh();
                        },
                        onCameraMove: _onCameraMove,
                        onCameraIdle: () {
                          _scheduleProjectionRefresh();
                          unawaited(_runSearch());
                        },
                        onTap: (_) => setState(() {
                          _selectedId = null;
                          _detailsExpanded = false;
                        }),
                      ),
                    ),
                    Positioned.fill(
                      child: IgnorePointer(
                        child: Stack(
                          children: _visibleNodes.map((node) {
                            final point = _screenPoints[node.id];
                            if (point == null) return const SizedBox.shrink();
                            final size = _heatSize(node, _zoom);
                            return Positioned(
                              left: point.dx - (size / 2),
                              top: point.dy - (size / 2),
                              width: size,
                              height: size,
                              child: DecoratedBox(
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  gradient: RadialGradient(
                                    colors: [
                                      _heatColor(node).withValues(alpha: 0.34),
                                      _heatColor(node).withValues(alpha: 0.2),
                                      _heatColor(node).withValues(alpha: 0.08),
                                      Colors.transparent,
                                    ],
                                    stops: const [0.0, 0.28, 0.58, 1.0],
                                  ),
                                  boxShadow: [
                                    BoxShadow(
                                      color: _heatColor(node).withValues(alpha: 0.2),
                                      blurRadius: 28,
                                      spreadRadius: 8,
                                    ),
                                  ],
                                ),
                              ),
                            );
                          }).toList(growable: false),
                        ),
                      ),
                    ),
                    Positioned.fill(
                      child: Stack(
                        children: _visibleNodes.map((node) {
                          final point = _screenPoints[node.id];
                          if (point == null) return const SizedBox.shrink();
                          return _overlayMarker(node, point);
                        }).toList(growable: false),
                      ),
                    ),
                    if (_loading) const ColoredBox(color: Color(0x55FFFFFF), child: Center(child: CircularProgressIndicator())),
                    if (selected != null)
                      Align(
                        alignment: Alignment.bottomCenter,
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: _detailCard(context, selected),
                        ),
                      ),
                  ]),
                ),
              ),
            ),
            SizedBox(
              height: 210,
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _results.isEmpty
                  ? Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(_query.isEmpty ? 'No map results match this filter.' : 'No building or location matches your search and filters.', textAlign: TextAlign.center)))
                  : ListView.separated(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
                      scrollDirection: Axis.horizontal,
                      itemCount: _results.length,
                      separatorBuilder: (_, _) => const SizedBox(width: 12),
                      itemBuilder: (context, index) {
                        final node = _results[index];
                        final selectedNode = node.id == _selectedId;
                        return SizedBox(
                          width: 300,
                          child: FilledButton.tonal(
                            style: FilledButton.styleFrom(
                              padding: const EdgeInsets.all(16),
                              backgroundColor: selectedNode ? node.color.withValues(alpha: 0.14) : Colors.white,
                              side: BorderSide(color: selectedNode ? node.color : const Color(0xFFD5DEEA)),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
                            ),
                            onPressed: () => _focusNode(node),
                            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Column(mainAxisSize: MainAxisSize.min, children: [
                                CircleAvatar(backgroundColor: node.color, foregroundColor: Colors.white, child: Text(node.badge)),
                                if (node.isFavorite) ...[const SizedBox(height: 8), const Icon(Icons.favorite_border, size: 18, color: Color(0xFFB45309))],
                              ]),
                              const SizedBox(width: 12),
                              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                Row(children: [
                                  Expanded(child: Text(_title(node), maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, color: Color(0xFF102A43)))),
                                  const SizedBox(width: 8),
                                  _pill(node.isGroup ? 'Building' : 'Spot'),
                                ]),
                                const SizedBox(height: 6),
                                Text(node.isGroup ? '${node.locationCount} study areas' : (node.sublocationLabel ?? ''), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600, color: Color(0xFF0F766E))),
                                const SizedBox(height: 6),
                                Text(node.summary, maxLines: 3, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Color(0xFF486581))),
                              ])),
                            ]),
                          ),
                        );
                      },
                    ),
            ),
          ],
        );
      },
      ),
    ),
    );
  }

  Widget _sectionLabel(String label) => Text(
        label,
        style: const TextStyle(
          color: Color(0xFF102A43),
          fontWeight: FontWeight.w800,
          fontSize: 13,
        ),
      );

  Widget _sortDropdown(String label, int index) {
    return DropdownButtonFormField<SearchSort?>(
      initialValue: _sortOrder[index],
      decoration: InputDecoration(
        labelText: label,
        filled: true,
        fillColor: const Color(0xFFF8FAFC),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: Color(0xFFD8E1EB)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: Color(0xFFD8E1EB)),
        ),
      ),
      items: [
        const DropdownMenuItem<SearchSort?>(value: null, child: Text('None')),
        ...SearchSort.values.map(
          (option) => DropdownMenuItem<SearchSort?>(
            value: option,
            child: Text(_sortLabel(option)),
          ),
        ),
      ],
      onChanged: (value) => _setSortAt(index, value),
    );
  }

  Widget _numberField({
    required TextEditingController controller,
    required String label,
    required ValueChanged<String> onChanged,
  }) {
    return TextField(
      controller: controller,
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      onChanged: onChanged,
      decoration: InputDecoration(
        labelText: label,
        filled: true,
        fillColor: const Color(0xFFF8FAFC),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: Color(0xFFD8E1EB)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: Color(0xFFD8E1EB)),
        ),
      ),
    );
  }

  Widget _showCheckbox({
    required String label,
    required bool value,
    required ValueChanged<bool?> onChanged,
  }) {
    return IntrinsicWidth(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        decoration: BoxDecoration(
          color: const Color(0xFFF8FAFC),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: const Color(0xFFD8E1EB)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Checkbox(
              value: value,
              onChanged: onChanged,
              visualDensity: VisualDensity.compact,
            ),
            Text(
              label,
              style: const TextStyle(
                color: Color(0xFF334E68),
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _overlayMarker(MapNode node, Offset point) {
    final selected = node.id == _selectedId;
    final zoomScale = _overlayZoomScale(_zoom, node.isGroup);
    final markerHeight = (node.isGroup ? 44.0 : 30.0) * zoomScale;
    final markerWidth = (node.isGroup ? 34.0 : 24.0) * zoomScale;
    final badgeSize = (node.isGroup ? 22.0 : 16.0) * zoomScale;
    final left = point.dx - (markerWidth / 2);
    final top = point.dy - markerHeight;

    return Positioned(
      left: left,
      top: top,
      width: markerWidth + badgeSize,
      height: markerHeight + 4,
      child: GestureDetector(
        behavior: HitTestBehavior.translucent,
        onTap: () => _focusNode(node),
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Positioned(
              left: 0,
              bottom: 0,
              child: _pinGlyph(
                color: node.color,
                label: node.badge,
                isMini: !node.isGroup,
                selected: selected,
                scale: zoomScale,
              ),
            ),
            Positioned(
              top: selected ? 0 : 2,
              right: 0,
              child: _soundBadge(
                color: _heatColor(node),
                size: badgeSize,
                selected: selected,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _pinGlyph({
    required Color color,
    required String label,
    required bool isMini,
    required bool selected,
    required double scale,
  }) {
    final shellSize = (isMini ? 18.0 : 26.0) * scale;
    final borderWidth = (isMini ? 2.4 : 3.2) * scale;

    return SizedBox(
      width: shellSize + (6 * scale),
      height: shellSize + (10 * scale),
      child: Stack(
        alignment: Alignment.bottomCenter,
        children: [
          Positioned(
            bottom: 0,
            child: Transform.rotate(
              angle: -math.pi / 4,
              child: Container(
                width: shellSize,
                height: shellSize,
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular((isMini ? 5 : 8) * scale),
                  border: Border.all(
                    color: selected ? const Color(0xFF102A43) : color,
                    width: borderWidth,
                  ),
                  boxShadow: const [
                    BoxShadow(
                      color: Color(0x33000000),
                      blurRadius: 10,
                      offset: Offset(0, 4),
                    ),
                  ],
                ),
              ),
            ),
          ),
          Positioned(
            bottom: (isMini ? 7 : 9) * scale,
            child: CircleAvatar(
              radius: (isMini ? 5.5 : 8.5) * scale,
              backgroundColor: color,
              foregroundColor: Colors.white,
              child: Text(
                label,
                style: TextStyle(
                  fontSize: (isMini ? 7 : 10) * scale,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _soundBadge({
    required Color color,
    required double size,
    required bool selected,
  }) {
    final iconSize = size * 0.52;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: const Color(0xFF102A43),
        boxShadow: const [
          BoxShadow(
            color: Color(0x33000000),
            blurRadius: 10,
            offset: Offset(0, 4),
          ),
        ],
      ),
      child: Center(
        child: Container(
          width: size * 0.62,
          height: size * 0.62,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: color,
            border: Border.all(
              color: selected ? Colors.white : const Color(0xFF102A43),
              width: 1.4,
            ),
          ),
          child: Icon(Icons.volume_up_rounded, size: iconSize, color: const Color(0xFF102A43)),
        ),
      ),
    );
  }

  Widget _detailCard(BuildContext context, MapNode node) {
    final maxHeight = node.isGroup ? 268.0 : 300.0;
    return AnimatedContainer(
      duration: const Duration(milliseconds: 180),
      constraints: BoxConstraints(
        maxWidth: 440,
        maxHeight: _detailsExpanded ? maxHeight : 124,
      ),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        boxShadow: const [
          BoxShadow(
            color: Color(0x22000000),
            blurRadius: 24,
            offset: Offset(0, 14),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(children: [
                CircleAvatar(
                  radius: node.isGroup ? 22 : 20,
                  backgroundColor: node.color,
                  foregroundColor: Colors.white,
                  child: Text(node.badge),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _title(node),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.w800,
                              color: const Color(0xFF102A43),
                            ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        node.isGroup
                            ? '${node.locationCount} study areas in this building'
                            : (node.sublocationLabel ?? node.buildingName),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              color: const Color(0xFF0F766E),
                              fontWeight: FontWeight.w700,
                            ),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  onPressed: () => setState(() => _detailsExpanded = !_detailsExpanded),
                  icon: Icon(_detailsExpanded ? Icons.expand_more : Icons.expand_less),
                ),
              ]),
              const SizedBox(height: 10),
              Text(
                node.summary,
                maxLines: _detailsExpanded ? 3 : 2,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: const Color(0xFF486581),
                    ),
              ),
              if (_detailsExpanded) ...[
                const SizedBox(height: 14),
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: [
                    _info('Name', node.isGroup ? node.buildingName : (node.sublocationLabel ?? node.title)),
                    if (node.distanceMeters != null) _info('Distance', _distanceLabel(node.distanceMeters!)),
                    _info('Noise', node.noiseText),
                    _info('Occupancy', node.occupancyText),
                    _info('Users present', _usersPresentText(node)),
                    _info('Last updated', node.updatedAtLabel),
                    _info('Usual business', _usualBusinessText(node)),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _info(String label, String value) {
    return DecoratedBox(
      decoration: BoxDecoration(color: const Color(0xFFF8FAFC), borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
          Text(label, style: const TextStyle(color: Color(0xFF829AB1), fontWeight: FontWeight.w800, fontSize: 11)),
          const SizedBox(height: 4),
          Text(value, style: const TextStyle(color: Color(0xFF334E68), fontWeight: FontWeight.w700)),
        ]),
      ),
    );
  }

  Widget _pill(String label) {
    return DecoratedBox(
      decoration: BoxDecoration(color: const Color(0xFFE2E8F0), borderRadius: BorderRadius.circular(999)),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        child: Text(label, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFF334155))),
      ),
    );
  }
}

String _title(MapNode node) => node.isGroup ? node.buildingName : '${node.buildingName} - ${node.title}';
String _groupId(String building) => 'group-${building.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]+'), '-')}';
String _badgeForFloor(String floorLabel, String title) => RegExp(r'(\d+)').firstMatch(floorLabel)?.group(1) ?? title.substring(0, 1).toUpperCase();
String _trimMetric(String? value, String fallback) => ((value ?? '').trim().contains(':')) ? (value!.split(':').last.trim()) : (((value ?? '').trim().isEmpty) ? fallback : value!.trim());
Severity _severityFromString(String? value) => switch ((value ?? '').toLowerCase().trim()) { 'high' => Severity.high, 'medium' => Severity.medium, _ => Severity.low };
String _severityLabel(Severity severity) => switch (severity) { Severity.high => 'High activity', Severity.medium => 'Moderate activity', Severity.low => 'Mostly quiet' };
String _sortLabel(SearchSort value) => switch (value) { SearchSort.relevance => 'Relevance', SearchSort.distance => 'Distance', SearchSort.noise => 'Noise', SearchSort.occupancy => 'Occupancy' };
String _distanceLabel(double value) => value >= 1000 ? '${(value / 1000).toStringAsFixed(2)} km' : '${value.round()} m';
double _overlayZoomScale(double zoom, bool isGroup) {
  if (isGroup) {
    return ((17.1 - zoom) * 0.22 + 1).clamp(0.8, 1.26);
  }
  return ((zoom - 16.4) * 0.18 + 1).clamp(0.92, 1.28);
}

double _heatSize(MapNode node, double zoom) {
  final baseSize = node.isGroup
      ? switch (node.severity) {
          Severity.high => 190.0,
          Severity.medium => 158.0,
          Severity.low => 132.0,
        }
      : switch (node.severity) {
          Severity.high => 128.0,
          Severity.medium => 108.0,
          Severity.low => 92.0,
        };
  return baseSize * _overlayZoomScale(zoom, node.isGroup);
}

Color _heatColor(MapNode node) => switch (node.severity) {
      Severity.low => const Color(0xFF2563EB),
      Severity.medium => const Color(0xFFFACC15),
      Severity.high => const Color(0xFFDC2626),
    };

Color _colorFromHex(String hex) {
  final normalized = hex.replaceFirst('#', '');
  final buffer = StringBuffer(normalized.length == 6 ? 'ff$normalized' : normalized);
  return Color(int.parse(buffer.toString(), radix: 16));
}
