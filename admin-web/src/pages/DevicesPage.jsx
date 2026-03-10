import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Table, Input, Space, Typography, Tag } from 'antd';
import client from '../api/client';
import UserLink from '../components/UserLink';

const { Search } = Input;
const { Title } = Typography;

export default function DevicesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const userId = searchParams.get('user_id') || '';
  const [deviceTokenFilter, setDeviceTokenFilter] = useState('');

  const fetchDevices = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, page_size: pageSize };
      if (userId) params.user_id = userId;
      if (deviceTokenFilter) params.device_token = deviceTokenFilter;
      const res = await client.get('/devices', { params });
      setData(res.data);
    } catch {
      // Error handled by interceptor
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, userId, deviceTokenFilter]);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  const handleDeviceTokenSearch = (value) => {
    setDeviceTokenFilter(value);
    setPage(1);
  };

  const handleClearUserFilter = () => {
    setSearchParams({});
    setPage(1);
  };

  const columns = [
    {
      title: 'Device ID',
      dataIndex: 'device_id',
      key: 'device_id',
    },
    {
      title: '\u7528\u6237',
      key: 'user',
      render: (_, record) => (
        <UserLink userId={record.user_id} email={record.user_email} />
      ),
    },
    {
      title: 'Device Token',
      dataIndex: 'device_token',
      key: 'device_token',
      ellipsis: true,
    },
    {
      title: 'Token Valid',
      dataIndex: 'token_valid',
      key: 'token_valid',
      render: (v) => <Tag color={v ? 'green' : 'red'}>{v ? 'Yes' : 'No'}</Tag>,
    },
    {
      title: '\u7248\u672c',
      dataIndex: 'version',
      key: 'version',
    },
    {
      title: '\u6e20\u9053',
      dataIndex: 'store',
      key: 'store',
    },
    {
      title: '\u66f4\u65b0\u65f6\u95f4',
      dataIndex: 'updated_at',
      key: 'updated_at',
      render: (text) => (text ? new Date(text).toLocaleString('zh-CN') : '-'),
    },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Title level={4}>{'\u8bbe\u5907\u4fe1\u606f'}</Title>
      <Space>
        <Search
          placeholder={'\u6309 device token \u641c\u7d22'}
          allowClear
          enterButton
          onSearch={handleDeviceTokenSearch}
          style={{ width: 350 }}
        />
        {userId && (
          <Tag closable onClose={handleClearUserFilter}>
            {`\u7528\u6237\u7b5b\u9009: ${userId.slice(0, 8)}...`}
          </Tag>
        )}
      </Space>
      <Table
        columns={columns}
        dataSource={data.items}
        rowKey="id"
        loading={loading}
        pagination={{
          current: page,
          pageSize,
          total: data.total,
          showSizeChanger: true,
          showTotal: (total) => `\u5171 ${total} \u6761`,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
      />
    </Space>
  );
}
